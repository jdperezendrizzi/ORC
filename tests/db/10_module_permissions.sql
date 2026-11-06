-- =====================================================================
-- Permisos por módulo: valores por defecto = comportamiento anterior;
-- restringir un módulo bloquea en la base; no se puede subir por encima
-- del rol; sólo el admin los cambia. (Usa los datos de supabase/seed.sql.)
-- =====================================================================
begin;
\o /dev/null

create schema mp_t;
grant usage on schema mp_t to authenticated;
create function mp_t.eq(actual bigint, expected bigint, msg text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then raise exception 'FALLA: % (esperado %, obtenido %)', msg, expected, actual; end if;
end $$;
create function mp_t.is(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FALLA: %', msg; end if;
end $$;
create function mp_t.throws(stmt text, msg text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then return; end;
  raise exception 'FALLA: % (se esperaba error)', msg;
end $$;
grant execute on all functions in schema mp_t to authenticated;

create temp table ctx as
select (select id from categories where code = 'M17') as m17,
       (select psc.player_id from player_season_categories psc join categories c on c.id = psc.category_id
          join consents k on k.player_id = psc.player_id and k.consent_type = 'medical_data' and k.revoked_at is null
        where c.code = 'M17' limit 1) as pl,
       (select id from test_metrics where code = 'sprint_10m_s') as metric,
       (select id from seasons where is_current) as season;
grant select on ctx to authenticated;

set local role authenticated;

-- Profe M17 con valores por defecto: todo en "carga"
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-a000-000000000017', true);
select mp_t.is((select bool_and(value = '"edit"') from jsonb_each(public.my_modules()) where key <> 'season_rollover'), 'profe: todos los módulos en carga por defecto (salvo pase de temporada)');
select mp_t.is((select count(*) from injuries) > 0, 'profe ve lesiones por defecto');
select mp_t.is((select count(*) from results) > 0, 'profe ve rendimiento por defecto');

-- Médico: por defecto según su rol
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-a000-0000000000ed', true);
select mp_t.is(public.my_modules() @> '{"performance":"view","attendance":"view","objectives":"none","promotion":"view","injuries":"edit","sharing":"edit"}', 'médico: valores de su rol');
-- No puede cambiar permisos
select mp_t.throws($$insert into user_module_permissions (profile_id, module, level) values ('d0000000-0000-4000-a000-0000000000ed', 'objectives', 'edit')$$, 'sólo el admin cambia permisos');

-- Admin restringe al profe: lesiones no ve, asistencia sólo ve, rendimiento no ve, compartir no
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-a000-000000000001', true);
insert into user_module_permissions (profile_id, module, level) values
  ('d0000000-0000-4000-a000-000000000017', 'injuries', 'none'),
  ('d0000000-0000-4000-a000-000000000017', 'attendance', 'view'),
  ('d0000000-0000-4000-a000-000000000017', 'performance', 'none'),
  ('d0000000-0000-4000-a000-000000000017', 'sharing', 'view'),
  -- intentar subir al médico por encima de su rol
  ('d0000000-0000-4000-a000-0000000000ed', 'objectives', 'edit'),
  -- restricciones a un admin no le afectan
  ('d0000000-0000-4000-a000-000000000001', 'injuries', 'none');
select mp_t.is((select count(*) from injuries) > 0, 'el admin sigue viendo todo aunque tenga una restricción');

select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-a000-000000000017', true);
select mp_t.eq((select count(*) from injuries), 0, 'profe sin módulo de lesiones: no las ve');
select mp_t.throws($$insert into injuries (id, player_id, occurred_on, context, body_region, injury_type, status)
  values (gen_random_uuid(), (select pl from ctx), current_date, 'match', 'knee', 'ligament', 'active')$$, 'profe sin módulo de lesiones: no las registra');
select mp_t.eq((select count(*) from results), 0, 'profe sin rendimiento: no ve resultados');
select mp_t.eq((select count(*) from evaluation_sessions), 0, 'profe sin rendimiento: no ve sesiones');
select mp_t.eq((select count(*) from public.category_benchmarks((select season from ctx), (select metric from ctx), null)), 0, 'profe sin rendimiento: sin benchmarks');
select mp_t.throws($$insert into attendance (id, player_id, category_id, season_id, att_date, status)
  values (gen_random_uuid(), (select pl from ctx), (select m17 from ctx), (select season from ctx), current_date, 'present')$$, 'asistencia sólo ver: no la toma');
select mp_t.throws($$select public.authorize_player_report((select pl from ctx))$$, 'compartir sólo ver: no comparte el PDF');
select mp_t.is(public.my_modules() @> '{"injuries":"none","attendance":"view","wellness":"edit"}', 'my_modules refleja las restricciones');
select mp_t.is((select count(*) from wellness_logs) > 0, 'los otros módulos siguen igual');

select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-a000-0000000000ed', true);
select mp_t.is(public.my_modules() @> '{"objectives":"none"}', 'no se sube por encima del rol');
reset role;

\o
do $$ begin raise notice '10_module_permissions: OK'; end $$;
rollback;
