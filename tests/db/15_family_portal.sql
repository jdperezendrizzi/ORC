-- =====================================================================
-- Portal de la familia: cada uno ve sólo a su jugador, sólo lectura, con
-- el consentimiento "Acceso de la familia"; nada de lesiones, bienestar
-- ni datos privados. (Usa los datos de supabase/seed.sql.)
-- =====================================================================
begin;
\o /dev/null
create schema fp_t;
grant usage on schema fp_t to authenticated;
create function fp_t.eq(actual bigint, expected bigint, msg text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then raise exception 'FALLA: % (esperado %, obtenido %)', msg, expected, actual; end if;
end $$;
create function fp_t.throws(stmt text, msg text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then return; end;
  raise exception 'FALLA: % (se esperaba error)', msg;
end $$;
grant execute on all functions in schema fp_t to authenticated;

-- Un jugador menor de M17 con tutor; otro jugador adulto de Primera
create temp table ctx as select
  (select psc.player_id from player_season_categories psc join categories c on c.id = psc.category_id
    join players p on p.id = psc.player_id where c.code = 'M17' and p.birth_date > current_date - interval '18 years' order by p.last_name limit 1) minor,
  (select psc.player_id from player_season_categories psc join categories c on c.id = psc.category_id where c.code = 'PRIMERA' order by psc.player_id limit 1) adult;
grant select on ctx to authenticated;
insert into auth.users (id, email) values
  ('f0000000-0000-4000-8000-000000000001', 'tutor@t'),
  ('f0000000-0000-4000-8000-000000000002', 'adulto@t'),
  ('f0000000-0000-4000-8000-000000000003', 'otro-tutor@t');
update profiles set role = 'guardian', active = true where id in ('f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000003');
update profiles set role = 'player', active = true where id = 'f0000000-0000-4000-8000-000000000002';
insert into guardians (id, full_name, profile_id) values ('9a000000-0000-4000-8000-000000000001', 'Tutor', 'f0000000-0000-4000-8000-000000000001');
insert into player_guardians (player_id, guardian_id, relationship) select minor, '9a000000-0000-4000-8000-000000000001', 'madre' from ctx;
update players set profile_id = 'f0000000-0000-4000-8000-000000000002' where id = (select adult from ctx);
-- El menor: sin consentimiento "Acceso de la familia" todavía
update consents set revoked_at = now() where consent_type = 'data_sharing_family' and player_id = (select minor from ctx) and revoked_at is null;
-- Datos para verificar
insert into attendance (id, player_id, category_id, season_id, att_date, status)
select gen_random_uuid(), psc.player_id, psc.category_id, psc.season_id, current_date - 1, 'present'
from player_season_categories psc join seasons s on s.id = psc.season_id and s.is_current;

set local role authenticated;

-- Tutor sin consentimiento: no ve nada
select set_config('request.jwt.claim.sub', 'f0000000-0000-4000-8000-000000000001', true);
select fp_t.eq((select count(*) from players), 0, 'tutor sin consentimiento «Acceso de la familia»: no ve al jugador');
reset role;
insert into consents (player_id, consent_type, document_version, guardian_id) select minor, 'data_sharing_family', 'v1', '9a000000-0000-4000-8000-000000000001' from ctx;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f0000000-0000-4000-8000-000000000001', true);
select fp_t.eq((select count(*) from players), 1, 'tutor con consentimiento: ve sólo a su jugador');
select fp_t.eq((select count(*) from player_season_categories), (select count(*) from player_season_categories where player_id = (select minor from ctx)), 'sólo la categoría de su jugador');
select fp_t.eq((select count(*) from attendance where player_id <> (select minor from ctx)), 0, 'no ve la asistencia de otros');
select fp_t.eq((select count(*) from attendance), 1, 've la asistencia de su jugador');
select fp_t.eq((select count(*) from results where player_id <> (select minor from ctx)), 0, 'no ve marcas de otros');
select fp_t.eq((select count(*) from injuries), 0, 'no ve lesiones');
select fp_t.eq((select count(*) from wellness_logs), 0, 'no ve bienestar');
select fp_t.eq((select count(*) from player_private), 0, 'no ve datos privados');
select fp_t.eq((select count(*) from promotion_reviews), 0, 'no ve la evaluación de pase');
select fp_t.eq(sign((select count(*) from categories))::bigint, 1, 've catálogos');
select fp_t.eq((select count(*) from public.category_benchmarks((select id from seasons where is_current), (select id from test_metrics where code = 'sprint_10m_s'), null)), 0, 'sin comparaciones con otros');
update players set first_name = 'X' where id = (select minor from ctx);
select fp_t.eq((select count(*) from players where first_name = 'X'), 0, 'no edita al jugador');
update attendance set status = 'absent' where player_id = (select minor from ctx);
select fp_t.eq((select count(*) from attendance where status = 'absent'), 0, 'no modifica la asistencia');

-- Otro tutor (sin jugadores a cargo): nada
select set_config('request.jwt.claim.sub', 'f0000000-0000-4000-8000-000000000003', true);
select fp_t.eq((select count(*) from players), 0, 'otro tutor no ve nada');

-- Jugador adulto: se ve a sí mismo sin consentimiento extra
select set_config('request.jwt.claim.sub', 'f0000000-0000-4000-8000-000000000002', true);
select fp_t.eq((select count(*) from players), 1, 'jugador adulto se ve a sí mismo');
select fp_t.eq((select count(*) from results where player_id <> (select adult from ctx)), 0, 'jugador no ve marcas de otros');
reset role;

-- Perfil desactivado: nada
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-a000-000000000001', true);
update profiles set active = false where id = 'f0000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f0000000-0000-4000-8000-000000000002', true);
select fp_t.eq((select count(*) from players), 0, 'cuenta desactivada no ve nada');
reset role;
\o
do $$ begin raise notice '15_family_portal: OK'; end $$;
rollback;
