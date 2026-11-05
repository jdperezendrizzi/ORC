-- =====================================================================
-- Pase de categoría: el profe recomienda (no decide); el admin decide;
-- el profe de otra categoría no lo ve; el destino sí.
-- =====================================================================
begin;
\o /dev/null

create schema pr_t;
grant usage on schema pr_t to authenticated;
create function pr_t.eq(actual bigint, expected bigint, msg text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then raise exception 'FALLA: % (esperado %, obtenido %)', msg, expected, actual; end if;
end $$;
create function pr_t.throws(stmt text, msg text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then return; end;
  raise exception 'FALLA: % (se esperaba error)', msg;
end $$;
grant execute on all functions in schema pr_t to authenticated;

update seasons set is_current = false;
insert into seasons (id, name, starts_on, ends_on, is_current)
  values ('5e000000-0000-4000-8000-000000102026', 'PR-2026', '2026-01-01', '2026-12-31', true);
insert into categories (id, code, name, level, sort_order) values
  ('ca000000-0000-4000-8000-00000010000a', 'PR-A', 'Pr A', 'juveniles', 201),
  ('ca000000-0000-4000-8000-00000010000b', 'PR-B', 'Pr B', 'juveniles', 202),
  ('ca000000-0000-4000-8000-00000010000c', 'PR-C', 'Pr C', 'juveniles', 203);
insert into auth.users (id, email) values
  ('c0000000-0000-4000-8000-000000100001', 'pr-coach-a@t'),
  ('c0000000-0000-4000-8000-000000100002', 'pr-coach-b@t'),
  ('c0000000-0000-4000-8000-000000100003', 'pr-coach-c@t'),
  ('c0000000-0000-4000-8000-000000100004', 'pr-admin@t');
update profiles set role = 'coach', active = true where id in ('c0000000-0000-4000-8000-000000100001', 'c0000000-0000-4000-8000-000000100002', 'c0000000-0000-4000-8000-000000100003');
update profiles set role = 'admin', active = true where id = 'c0000000-0000-4000-8000-000000100004';
insert into coach_assignments (profile_id, category_id, season_id) values
  ('c0000000-0000-4000-8000-000000100001', 'ca000000-0000-4000-8000-00000010000a', '5e000000-0000-4000-8000-000000102026'),
  ('c0000000-0000-4000-8000-000000100002', 'ca000000-0000-4000-8000-00000010000b', '5e000000-0000-4000-8000-000000102026'),
  ('c0000000-0000-4000-8000-000000100003', 'ca000000-0000-4000-8000-00000010000c', '5e000000-0000-4000-8000-000000102026');
insert into players (id, first_name, last_name, birth_date, sex) values ('b1000000-0000-4000-8000-000000100001', 'Uno', 'PR', '2009-01-01', 'male');
insert into player_season_categories (player_id, season_id, category_id)
  values ('b1000000-0000-4000-8000-000000100001', '5e000000-0000-4000-8000-000000102026', 'ca000000-0000-4000-8000-00000010000a');

set local role authenticated;

-- Profe A recomienda; intenta además decidir: la decisión se ignora
select set_config('request.jwt.claim.sub', 'c0000000-0000-4000-8000-000000100001', true);
insert into promotion_reviews (player_id, season_id, from_category_id, target_category_id, recommendation, recommendation_note, decision)
values ('b1000000-0000-4000-8000-000000100001', '5e000000-0000-4000-8000-000000102026', 'ca000000-0000-4000-8000-00000010000a', 'ca000000-0000-4000-8000-00000010000b', 'promote', 'Listo', 'promote');
select pr_t.eq((select count(*) from promotion_reviews where recommendation = 'promote' and decision is null and recommended_by = 'c0000000-0000-4000-8000-000000100001'), 1, 'el profe recomienda pero no decide');
update promotion_reviews set decision = 'stay', recommendation = 'observe';
select pr_t.eq((select count(*) from promotion_reviews where recommendation = 'observe' and decision is null), 1, 'el profe cambia su recomendación, no la decisión');
select pr_t.throws($$insert into promotion_reviews (player_id, season_id, from_category_id, recommendation)
  values ('b1000000-0000-4000-8000-000000100001', '5e000000-0000-4000-8000-000000102026', 'ca000000-0000-4000-8000-00000010000b', 'stay')$$, 'categoría que no es la del jugador');

-- Profe B (destino) lo ve; profe C no
select set_config('request.jwt.claim.sub', 'c0000000-0000-4000-8000-000000100002', true);
select pr_t.eq((select count(*) from promotion_reviews), 1, 'el profe de la categoría de destino lo ve');
update promotion_reviews set recommendation = 'stay';
select set_config('request.jwt.claim.sub', 'c0000000-0000-4000-8000-000000100003', true);
select pr_t.eq((select count(*) from promotion_reviews), 0, 'el profe de otra categoría no lo ve');

-- Admin decide
select set_config('request.jwt.claim.sub', 'c0000000-0000-4000-8000-000000100004', true);
select pr_t.eq((select count(*) from promotion_reviews where recommendation = 'observe'), 1, 'el profe de destino no pudo cambiar la recomendación');
update promotion_reviews set decision = 'promote', decision_note = 'Sube a Pr B';
select pr_t.eq((select count(*) from promotion_reviews where decision = 'promote' and decided_by = 'c0000000-0000-4000-8000-000000100004' and recommended_by = 'c0000000-0000-4000-8000-000000100001'), 1, 'el admin decide; queda quién recomendó y quién decidió');
reset role;

\o
do $$ begin raise notice '09_promotion_reviews: OK'; end $$;
rollback;
