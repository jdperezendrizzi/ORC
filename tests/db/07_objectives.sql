-- =====================================================================
-- Objetivos: el admin los carga; el profe los ve y tacha sólo en sus
-- categorías; reenvío offline idempotente; reglas de equipo/jugador.
-- =====================================================================
begin;
\o /dev/null

create schema ob_t;
grant usage on schema ob_t to authenticated;
create function ob_t.eq(actual bigint, expected bigint, msg text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then raise exception 'FALLA: % (esperado %, obtenido %)', msg, expected, actual; end if;
end $$;
create function ob_t.throws(stmt text, msg text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then return; end;
  raise exception 'FALLA: % (se esperaba error)', msg;
end $$;
grant execute on all functions in schema ob_t to authenticated;

-- El borrador quedó cargado para M6 y M7
select ob_t.eq((select count(*) from objectives o join categories c on c.id = o.category_id where c.code in ('M6', 'M7')), 10, 'borrador de objetivos M6/M7');
select ob_t.eq((select count(*) from categories where code in ('M6','M7','M8','M9','M10','M11','M13')), 7, 'categorías infantiles nuevas');

insert into consent_types (code, name, description) values ('performance_data', 't', 't') on conflict do nothing;
update seasons set is_current = false;
insert into seasons (id, name, starts_on, ends_on, is_current)
  values ('5e000000-0000-4000-8000-0000000e2026', 'OB-2026', '2026-01-01', '2026-12-31', true);
insert into auth.users (id, email) values
  ('c0000000-0000-4000-8000-0000000e0001', 'ob-coach-m7@t'),
  ('c0000000-0000-4000-8000-0000000e0002', 'ob-coach-m6@t'),
  ('c0000000-0000-4000-8000-0000000e0003', 'ob-admin@t'),
  ('c0000000-0000-4000-8000-0000000e0004', 'ob-med@t');
update profiles set role = 'coach', active = true where id in ('c0000000-0000-4000-8000-0000000e0001', 'c0000000-0000-4000-8000-0000000e0002');
update profiles set role = 'admin', active = true where id = 'c0000000-0000-4000-8000-0000000e0003';
update profiles set role = 'medical', active = true where id = 'c0000000-0000-4000-8000-0000000e0004';
insert into coach_assignments (profile_id, category_id, season_id)
select 'c0000000-0000-4000-8000-0000000e0001', id, '5e000000-0000-4000-8000-0000000e2026' from categories where code = 'M7';
insert into coach_assignments (profile_id, category_id, season_id)
select 'c0000000-0000-4000-8000-0000000e0002', id, '5e000000-0000-4000-8000-0000000e2026' from categories where code = 'M6';
insert into players (id, first_name, last_name, birth_date, sex) values
  ('b1000000-0000-4000-8000-0000000e0001', 'Con', 'OB', '2000-01-01', 'male'),
  ('b1000000-0000-4000-8000-0000000e0002', 'Sin', 'OB', '2000-01-01', 'male');
insert into consents (player_id, consent_type, document_version) values ('b1000000-0000-4000-8000-0000000e0001', 'performance_data', 'v1');

create temp table ids as
select (select o.id from objectives o join categories c on c.id = o.category_id where c.code = 'M7' order by o.sort_order limit 1) as m7_obj,
       (select o.id from objectives o join categories c on c.id = o.category_id where c.code = 'M6' order by o.sort_order limit 1) as m6_obj,
       (select id from categories where code = 'M7') as m7;
grant select on ids to authenticated;

set local role authenticated;

-- Profe M7: ve sólo los de M7, no puede editarlos
select set_config('request.jwt.claim.sub', 'c0000000-0000-4000-8000-0000000e0001', true);
select ob_t.eq((select count(*) from objectives), 5, 'el profe de M7 ve sólo los objetivos de M7');
update objectives set title = 'cambiado' where id = (select m7_obj from ids);
select ob_t.eq((select count(*) from objectives where title = 'cambiado'), 0, 'el profe no edita objetivos');
select ob_t.throws($$insert into objectives (category_id, title) values ((select m7 from ids), 'nuevo del profe')$$, 'el profe no crea objetivos');

-- Tacha (y el reenvío offline con el mismo id no duplica); destacha el mismo día
insert into objective_checks (id, objective_id, season_id, check_date, achieved)
values ('0c000000-0000-4000-8000-0000000e0001', (select m7_obj from ids), '5e000000-0000-4000-8000-0000000e2026', '2026-05-01', true)
on conflict (id) do update set achieved = excluded.achieved;
insert into objective_checks (id, objective_id, season_id, check_date, achieved, note)
values ('0c000000-0000-4000-8000-0000000e0001', (select m7_obj from ids), '5e000000-0000-4000-8000-0000000e2026', '2026-05-01', false, 'hoy no')
on conflict (id) do update set achieved = excluded.achieved, note = excluded.note;
select ob_t.eq((select count(*) from objective_checks where achieved = false and note = 'hoy no'), 1, 'tachar/destachar el mismo día pisa la misma fila');
select ob_t.eq((select count(*) from objective_checks where checked_by = 'c0000000-0000-4000-8000-0000000e0001'), 1, 'queda quién lo marcó');

-- No puede tachar en otra categoría, ni con jugador en un objetivo de equipo, ni a futuro
select ob_t.throws($$insert into objective_checks (id, objective_id, season_id, check_date, achieved)
  values (gen_random_uuid(), (select m6_obj from ids), '5e000000-0000-4000-8000-0000000e2026', '2026-05-01', true)$$, 'el profe de M7 no tacha en M6');
select ob_t.throws($$insert into objective_checks (id, objective_id, season_id, check_date, player_id, achieved)
  values (gen_random_uuid(), (select m7_obj from ids), '5e000000-0000-4000-8000-0000000e2026', '2026-05-02', 'b1000000-0000-4000-8000-0000000e0001', true)$$, 'objetivo de equipo sin jugador');
select ob_t.throws($$insert into objective_checks (id, objective_id, season_id, check_date, achieved)
  values (gen_random_uuid(), (select m7_obj from ids), '5e000000-0000-4000-8000-0000000e2026', current_date + 5, true)$$, 'no a futuro');

-- Profe M6 no ve lo de M7
select set_config('request.jwt.claim.sub', 'c0000000-0000-4000-8000-0000000e0002', true);
select ob_t.eq((select count(*) from objective_checks), 0, 'el profe de M6 no ve el checklist de M7');

-- Área médica: no lo usa
select set_config('request.jwt.claim.sub', 'c0000000-0000-4000-8000-0000000e0004', true);
select ob_t.eq((select count(*) from objectives), 0, 'el área médica no ve objetivos');

-- Admin: crea un objetivo por jugador; exige consentimiento de rendimiento
select set_config('request.jwt.claim.sub', 'c0000000-0000-4000-8000-0000000e0003', true);
insert into objectives (id, category_id, scope, title) values ('0b000000-0000-4000-8000-0000000e0001', (select id from categories where code = 'M17'), 'player', 'Pasa con las dos manos');
insert into objective_checks (id, objective_id, season_id, check_date, player_id, achieved)
values (gen_random_uuid(), '0b000000-0000-4000-8000-0000000e0001', '5e000000-0000-4000-8000-0000000e2026', '2026-05-01', 'b1000000-0000-4000-8000-0000000e0001', true);
select ob_t.throws($$insert into objective_checks (id, objective_id, season_id, check_date, player_id, achieved)
  values (gen_random_uuid(), '0b000000-0000-4000-8000-0000000e0001', '5e000000-0000-4000-8000-0000000e2026', '2026-05-01', 'b1000000-0000-4000-8000-0000000e0002', true)$$, 'objetivo por jugador sin consentimiento');
select ob_t.throws($$insert into objective_checks (id, objective_id, season_id, check_date, achieved)
  values (gen_random_uuid(), '0b000000-0000-4000-8000-0000000e0001', '5e000000-0000-4000-8000-0000000e2026', '2026-05-03', true)$$, 'objetivo por jugador exige jugador');
select ob_t.eq((select count(*) from objective_checks), 2, 'el admin ve todo el checklist');
reset role;

\o
do $$ begin raise notice '07_objectives: OK'; end $$;
rollback;
