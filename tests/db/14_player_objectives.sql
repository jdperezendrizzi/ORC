-- =====================================================================
-- Objetivos por jugador desde M13 (configurable): tipo automático,
-- cambio del ajuste sólo admin, no pierde historial, marcas por jugador.
-- (Usa los datos de supabase/seed.sql.)
-- =====================================================================
begin;
\o /dev/null
create schema po_t;
grant usage on schema po_t to authenticated;
create function po_t.eq(actual bigint, expected bigint, msg text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then raise exception 'FALLA: % (esperado %, obtenido %)', msg, expected, actual; end if;
end $$;
create function po_t.is(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FALLA: %', msg; end if;
end $$;
create function po_t.throws(stmt text, msg text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then return; end;
  raise exception 'FALLA: % (se esperaba error)', msg;
end $$;
grant execute on all functions in schema po_t to authenticated;
create temp table ctx as select
  (select id from categories where code = 'M7') m7, (select id from categories where code = 'M13') m13,
  (select id from categories where code = 'M15') m15, (select id from categories where code = 'M17') m17,
  (select id from seasons where is_current) season,
  (select psc.player_id from player_season_categories psc join categories c on c.id = psc.category_id
     join consents k on k.player_id = psc.player_id and k.consent_type = 'performance_data' and k.revoked_at is null
   where c.code = 'M17' limit 1) pl;
grant select on ctx to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-a000-000000000001', true);
-- Tipo automático según M13
insert into objectives (id, category_id, title) values
  ('0b000000-0000-4000-8000-0000000f0001', (select m7 from ctx), 'Equipo M7'),
  ('0b000000-0000-4000-8000-0000000f0002', (select m17 from ctx), 'Jugador M17'),
  ('0b000000-0000-4000-8000-0000000f0003', (select m15 from ctx), 'Jugador M15');
select po_t.eq((select count(*) from objectives where id = '0b000000-0000-4000-8000-0000000f0001' and scope = 'team'), 1, 'M7: del equipo');
select po_t.eq((select count(*) from objectives where id = '0b000000-0000-4000-8000-0000000f0002' and scope = 'player'), 1, 'M17: por jugador');

-- Profe M17 marca por jugador
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-a000-000000000017', true);
insert into objective_checks (id, objective_id, season_id, check_date, player_id, achieved)
values (gen_random_uuid(), '0b000000-0000-4000-8000-0000000f0002', (select season from ctx), current_date, (select pl from ctx), true);
select po_t.throws($$insert into objective_checks (id, objective_id, season_id, check_date, achieved)
  values (gen_random_uuid(), '0b000000-0000-4000-8000-0000000f0002', (select season from ctx), current_date, true)$$, 'objetivo por jugador exige jugador');
select po_t.throws($$select public.set_player_objectives_from((select m15 from ctx))$$, 'sólo el admin cambia el ajuste');

-- Admin pasa el corte a M15: M13/M14 vuelven a equipo; M17 con marcas por jugador no cambia
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-a000-000000000001', true);
insert into objectives (id, category_id, title) values ('0b000000-0000-4000-8000-0000000f0004', (select m13 from ctx), 'Jugador M13');
select po_t.eq((select count(*) from objectives where id = '0b000000-0000-4000-8000-0000000f0004' and scope = 'player'), 1, 'M13: por jugador con el corte en M13');
select po_t.is((public.set_player_objectives_from((select m15 from ctx)) ->> 'changed')::int >= 1, 'convierte los afectados');
select po_t.eq((select count(*) from objectives where id = '0b000000-0000-4000-8000-0000000f0004' and scope = 'team'), 1, 'M13 vuelve a equipo con el corte en M15');
select po_t.eq((select count(*) from objectives where id = '0b000000-0000-4000-8000-0000000f0003' and scope = 'player'), 1, 'M15 sigue por jugador');
-- Corte en Primera: M17 tiene marcas por jugador → no se convierte (se informa)
select po_t.is(jsonb_array_length(public.set_player_objectives_from((select id from categories where code = 'PRIMERA')) -> 'skipped') >= 1, 'informa los que no puede convertir');
select po_t.eq((select count(*) from objectives where id = '0b000000-0000-4000-8000-0000000f0002' and scope = 'player'), 1, 'no pierde historial');
reset role;
\o
do $$ begin raise notice '14_player_objectives: OK'; end $$;
rollback;
