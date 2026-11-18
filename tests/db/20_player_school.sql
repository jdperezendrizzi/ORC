-- =====================================================================
-- Colegio del jugador: se importa desde el Excel y se guarda como dato
-- privado (con el DNI); reimportar con otro colegio lo actualiza.
-- (Usa los datos de supabase/seed.sql.)
-- =====================================================================
begin;
\o /dev/null
create schema ps_t;
grant usage on schema ps_t to authenticated;
create function ps_t.is(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FALLA: %', msg; end if;
end $$;
grant execute on all functions in schema ps_t to authenticated;
create temp table ctx as select (select id from seasons where is_current) season, (select id from categories where code = 'M6') m6;
grant select on ctx to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-a000-000000000001', true);
select public.import_roster((select season from ctx), jsonb_build_array(
  jsonb_build_object('line', 2, 'first_name', 'Kai', 'last_name', 'COLEGIO', 'birth_date', '2020-01-10', 'sex', 'male',
                     'category_id', (select m6 from ctx), 'document_id', '58000001', 'school', '  Dardo Rocha '),
  jsonb_build_object('line', 3, 'first_name', 'Sin', 'last_name', 'COLEGIO', 'birth_date', '2020-02-10', 'sex', 'male',
                     'category_id', (select m6 from ctx))));
select ps_t.is((select pp.school = 'Dardo Rocha' and pp.document_id = '58000001' from player_private pp join players p on p.id = pp.player_id where p.first_name = 'Kai' and p.last_name = 'COLEGIO'), 'guarda el colegio (sin espacios) junto al DNI');
select ps_t.is(not exists (select 1 from player_private pp join players p on p.id = pp.player_id where p.first_name = 'Sin' and p.last_name = 'COLEGIO'), 'sin colegio ni DNI no crea datos privados');
-- Reimportar con otro colegio lo actualiza
select public.import_roster((select season from ctx), jsonb_build_array(
  jsonb_build_object('line', 2, 'player_id', (select id from players where first_name = 'Kai' and last_name = 'COLEGIO'),
                     'first_name', 'Kai', 'last_name', 'COLEGIO', 'birth_date', '2020-01-10', 'sex', 'male',
                     'category_id', (select m6 from ctx), 'school', 'Juan XXIII')));
select ps_t.is((select pp.school = 'Juan XXIII' from player_private pp join players p on p.id = pp.player_id where p.first_name = 'Kai'), 'reimportar actualiza el colegio');
reset role;
-- Un profe no ve los datos privados de otra categoría
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-a000-000000000017', true);
select ps_t.is((select count(*) from player_private pp join players p on p.id = pp.player_id where p.last_name = 'COLEGIO') = 0, 'el profe de M17 no ve el colegio de M6');
reset role;
\o
do $$ begin raise notice '20_player_school: OK'; end $$;
rollback;
