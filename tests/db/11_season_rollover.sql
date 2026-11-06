-- =====================================================================
-- Pase de temporada: sólo admin por defecto; el admin lo habilita a un
-- profe (sólo sus categorías); al médico no; todo o nada; los ya
-- asignados se saltean. (Usa los datos de supabase/seed.sql.)
-- =====================================================================
begin;
\o /dev/null

create schema sr_t;
grant usage on schema sr_t to authenticated;
create function sr_t.eq(actual bigint, expected bigint, msg text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then raise exception 'FALLA: % (esperado %, obtenido %)', msg, expected, actual; end if;
end $$;
create function sr_t.is(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FALLA: %', msg; end if;
end $$;
create function sr_t.throws(stmt text, msg text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then return; end;
  raise exception 'FALLA: % (se esperaba error)', msg;
end $$;
grant execute on all functions in schema sr_t to authenticated;

insert into seasons (id, name, starts_on, ends_on, is_current)
  values ('5e000000-0000-4000-8000-000000112027', 'SR-2027', '2027-01-01', '2027-12-31', false);

create temp table ctx as
select (select id from seasons where is_current) as s26,
       '5e000000-0000-4000-8000-000000112027'::uuid as s27,
       (select id from categories where code = 'M15') as m15,
       (select id from categories where code = 'M16') as m16,
       (select id from categories where code = 'M17') as m17,
       (select id from categories where code = 'M19') as m19;
create temp table moves15 as
select jsonb_agg(jsonb_build_object('player_id', psc.player_id, 'category_id', (select m16 from ctx))) as j
from player_season_categories psc where psc.season_id = (select s26 from ctx) and psc.category_id = (select m15 from ctx);
create temp table moves17 as
select jsonb_agg(jsonb_build_object('player_id', psc.player_id, 'category_id', (select m19 from ctx))) as j
from player_season_categories psc where psc.season_id = (select s26 from ctx) and psc.category_id = (select m17 from ctx);
grant select on ctx, moves15, moves17 to authenticated;

set local role authenticated;

-- Profe M15 por defecto: no puede
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-a000-000000000015', true);
select sr_t.is(public.my_modules() ->> 'season_rollover' = 'none', 'profe: pase de temporada apagado por defecto');
select sr_t.throws($$select public.apply_promotions((select s26 from ctx), (select s27 from ctx), (select j from moves15))$$, 'profe sin permiso no aplica pases');

-- Admin habilita al profe M15 y al médico (al médico no le llega)
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-a000-000000000001', true);
insert into user_module_permissions (profile_id, module, level) values
  ('d0000000-0000-4000-a000-000000000015', 'season_rollover', 'edit'),
  ('d0000000-0000-4000-a000-0000000000ed', 'season_rollover', 'edit');

select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-a000-0000000000ed', true);
select sr_t.is(public.my_modules() ->> 'season_rollover' = 'none', 'al área médica no se le puede habilitar');

-- Profe M15 habilitado: pasa su categoría, no la de otro
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-a000-000000000015', true);
select sr_t.throws($$select public.apply_promotions((select s26 from ctx), (select s27 from ctx), (select j from moves17))$$, 'profe habilitado: no pasa otra categoría');
select sr_t.eq((select count(*) from player_season_categories where season_id = (select s27 from ctx)), 0, 'el error no deja nada a medias');
select sr_t.eq((public.apply_promotions((select s26 from ctx), (select s27 from ctx), (select j from moves15)) ->> 'applied')::int,
  (select jsonb_array_length(j) from moves15), 'profe habilitado pasa M15 → M16');
reset role;
select sr_t.eq((select count(*) from player_season_categories where season_id = (select s27 from ctx) and category_id = (select m16 from ctx)),
  (select jsonb_array_length(j) from moves15), 'quedan en M16 en la temporada 2027');
set local role authenticated;

-- Admin: repetir saltea a los ya asignados; temporada destino anterior: error
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-a000-000000000001', true);
select sr_t.eq((public.apply_promotions((select s26 from ctx), (select s27 from ctx), (select j from moves15)) ->> 'skipped')::int,
  (select jsonb_array_length(j) from moves15), 'repetir no duplica (se saltean)');
select sr_t.throws($$select public.apply_promotions((select s27 from ctx), (select s26 from ctx), (select j from moves15))$$, 'destino anterior al origen');
select sr_t.throws($$select public.apply_promotions((select s26 from ctx), (select s27 from ctx), '[{"player_id":"b1000000-0000-4000-8000-0000000000aa","category_id":"b1000000-0000-4000-8000-0000000000aa"}]')$$, 'jugador inexistente');
reset role;

\o
do $$ begin raise notice '11_season_rollover: OK'; end $$;
rollback;
