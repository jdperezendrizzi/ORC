-- =====================================================================
-- Objetivos con 3 estados: conversión, compatibilidad con la versión
-- anterior (sólo achieved) y achieved derivado. (Usa supabase/seed.sql.)
-- =====================================================================
begin;
\o /dev/null
create schema os_t;
grant usage on schema os_t to authenticated;
create function os_t.is(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FALLA: %', msg; end if;
end $$;
grant execute on all functions in schema os_t to authenticated;
create temp table ctx as select (select id from categories where code = 'M7') m7, (select id from seasons where is_current) season;
grant select on ctx to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-a000-000000000001', true);
insert into objectives (id, category_id, title) values ('0e000000-0000-4000-8000-000000000001', (select m7 from ctx), 'Avanzan');

-- App nueva: manda status
insert into objective_checks (id, objective_id, season_id, check_date, status)
values ('0e000000-0000-4000-8000-0000000000c1', '0e000000-0000-4000-8000-000000000001', (select season from ctx), current_date - 2, 'in_progress');
select os_t.is((select status = 'in_progress' and achieved = false from objective_checks where id = '0e000000-0000-4000-8000-0000000000c1'), 'en progreso: achieved = false');
update objective_checks set status = 'achieved' where id = '0e000000-0000-4000-8000-0000000000c1';
select os_t.is((select achieved from objective_checks where id = '0e000000-0000-4000-8000-0000000000c1'), 'logrado: achieved = true');

-- Versión anterior: sólo achieved (alta y corrección)
insert into objective_checks (id, objective_id, season_id, check_date, achieved)
values ('0e000000-0000-4000-8000-0000000000c2', '0e000000-0000-4000-8000-000000000001', (select season from ctx), current_date - 1, true);
select os_t.is((select status = 'achieved' from objective_checks where id = '0e000000-0000-4000-8000-0000000000c2'), 'versión anterior (sí) → logrado');
insert into objective_checks (id, objective_id, season_id, check_date, achieved)
values ('0e000000-0000-4000-8000-0000000000c2', '0e000000-0000-4000-8000-000000000001', (select season from ctx), current_date - 1, false)
on conflict (id) do update set achieved = excluded.achieved;
select os_t.is((select status = 'not_yet' and achieved = false from objective_checks where id = '0e000000-0000-4000-8000-0000000000c2'), 'versión anterior corrige (no) → todavía no');

-- App nueva con upsert completo
insert into objective_checks (id, objective_id, season_id, check_date, status, achieved)
values ('0e000000-0000-4000-8000-0000000000c2', '0e000000-0000-4000-8000-000000000001', (select season from ctx), current_date - 1, 'in_progress', false)
on conflict (id) do update set status = excluded.status, achieved = excluded.achieved;
select os_t.is((select status = 'in_progress' from objective_checks where id = '0e000000-0000-4000-8000-0000000000c2'), 'upsert de la app nueva respeta el estado');
-- status manda sobre un achieved contradictorio
update objective_checks set status = 'achieved', achieved = false where id = '0e000000-0000-4000-8000-0000000000c2';
select os_t.is((select achieved from objective_checks where id = '0e000000-0000-4000-8000-0000000000c2'), 'achieved siempre = (status = logrado)');
reset role;
\o
do $$ begin raise notice '18_objective_status: OK'; end $$;
rollback;
