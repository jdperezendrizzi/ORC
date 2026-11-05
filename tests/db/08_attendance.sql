-- =====================================================================
-- Asistencia: el profe la toma sólo en sus categorías; reenvío offline
-- idempotente; médico sólo lee; jugador debe estar en la categoría.
-- =====================================================================
begin;
\o /dev/null

create schema at_t;
grant usage on schema at_t to authenticated;
create function at_t.eq(actual bigint, expected bigint, msg text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then raise exception 'FALLA: % (esperado %, obtenido %)', msg, expected, actual; end if;
end $$;
create function at_t.throws(stmt text, msg text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then return; end;
  raise exception 'FALLA: % (se esperaba error)', msg;
end $$;
grant execute on all functions in schema at_t to authenticated;

update seasons set is_current = false;
insert into seasons (id, name, starts_on, ends_on, is_current)
  values ('5e000000-0000-4000-8000-0000000f2026', 'AT-2026', '2026-01-01', '2026-12-31', true);
insert into categories (id, code, name, level) values
  ('ca000000-0000-4000-8000-0000000f000a', 'AT-A', 'At A', 'infantiles'),
  ('ca000000-0000-4000-8000-0000000f000b', 'AT-B', 'At B', 'infantiles');
insert into auth.users (id, email) values
  ('c0000000-0000-4000-8000-0000000f0001', 'at-coach@t'),
  ('c0000000-0000-4000-8000-0000000f0002', 'at-med@t');
update profiles set role = 'coach', active = true where id = 'c0000000-0000-4000-8000-0000000f0001';
update profiles set role = 'medical', active = true where id = 'c0000000-0000-4000-8000-0000000f0002';
insert into coach_assignments (profile_id, category_id, season_id)
  values ('c0000000-0000-4000-8000-0000000f0001', 'ca000000-0000-4000-8000-0000000f000a', '5e000000-0000-4000-8000-0000000f2026');
-- Menores, sin ningún consentimiento: la asistencia no lo pide
insert into players (id, first_name, last_name, birth_date, sex) values
  ('b1000000-0000-4000-8000-0000000f0001', 'Uno', 'AT', '2019-01-01', 'male'),
  ('b1000000-0000-4000-8000-0000000f0002', 'Dos', 'AT', '2019-01-01', 'male');
insert into player_season_categories (player_id, season_id, category_id) values
  ('b1000000-0000-4000-8000-0000000f0001', '5e000000-0000-4000-8000-0000000f2026', 'ca000000-0000-4000-8000-0000000f000a'),
  ('b1000000-0000-4000-8000-0000000f0002', '5e000000-0000-4000-8000-0000000f2026', 'ca000000-0000-4000-8000-0000000f000b');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c0000000-0000-4000-8000-0000000f0001', true);

insert into attendance (id, player_id, category_id, season_id, att_date, status)
values ('a7000000-0000-4000-8000-0000000f0001', 'b1000000-0000-4000-8000-0000000f0001', 'ca000000-0000-4000-8000-0000000f000a', '5e000000-0000-4000-8000-0000000f2026', '2026-05-01', 'present')
on conflict (id) do update set status = excluded.status, kind = excluded.kind, note = excluded.note;
insert into attendance (id, player_id, category_id, season_id, att_date, status, note)
values ('a7000000-0000-4000-8000-0000000f0001', 'b1000000-0000-4000-8000-0000000f0001', 'ca000000-0000-4000-8000-0000000f000a', '5e000000-0000-4000-8000-0000000f2026', '2026-05-01', 'excused', 'examen')
on conflict (id) do update set status = excluded.status, kind = excluded.kind, note = excluded.note;
select at_t.eq((select count(*) from attendance where status = 'excused' and note = 'examen'), 1, 'menor sin consentimientos: se toma y se corrige (reenvío no duplica)');

select at_t.throws($$insert into attendance (id, player_id, category_id, season_id, att_date, status)
  values (gen_random_uuid(), 'b1000000-0000-4000-8000-0000000f0002', 'ca000000-0000-4000-8000-0000000f000b', '5e000000-0000-4000-8000-0000000f2026', '2026-05-01', 'present')$$,
  'el profe no toma asistencia en otra categoría');
select at_t.throws($$insert into attendance (id, player_id, category_id, season_id, att_date, status)
  values (gen_random_uuid(), 'b1000000-0000-4000-8000-0000000f0002', 'ca000000-0000-4000-8000-0000000f000a', '5e000000-0000-4000-8000-0000000f2026', '2026-05-01', 'present')$$,
  'el jugador tiene que estar en la categoría');
select at_t.throws($$insert into attendance (id, player_id, category_id, season_id, att_date, status)
  values (gen_random_uuid(), 'b1000000-0000-4000-8000-0000000f0001', 'ca000000-0000-4000-8000-0000000f000a', '5e000000-0000-4000-8000-0000000f2026', current_date + 5, 'present')$$,
  'no a futuro');
delete from attendance;
select at_t.eq((select count(*) from attendance), 1, 'el profe no borra');

select set_config('request.jwt.claim.sub', 'c0000000-0000-4000-8000-0000000f0002', true);
select at_t.eq((select count(*) from attendance), 1, 'el área médica la ve');
update attendance set status = 'absent';
select at_t.eq((select count(*) from attendance where status = 'absent'), 0, 'el área médica no la modifica');
reset role;

\o
do $$ begin raise notice '08_attendance: OK'; end $$;
rollback;
