-- =====================================================================
-- Tests de RLS por rol. Transacción con ROLLBACK: no deja datos.
--
-- Escenario
--   Temporada actual T-2026 y anterior T-2025.
--   Cat A: pA1, pA2 · Cat B: pB1 · pA1 estuvo en Cat B en T-2025.
--   coach_a → Cat A (2026) · coach_b → Cat B (2026)
--   coach_off → Cat A pero inactivo · medical · admin
-- =====================================================================
begin;
\o /dev/null

-- ---------- helpers de test ----------
create schema rls_t;
grant usage on schema rls_t to authenticated, anon;

create function rls_t.eq(actual bigint, expected bigint, msg text) returns void
language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FALLA: % (esperado %, obtenido %)', msg, expected, actual;
  end if;
end $$;

create function rls_t.throws(stmt text, msg text) returns void
language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    return;
  end;
  raise exception 'FALLA: % (se esperaba error)', msg;
end $$;

create function rls_t.ok(stmt text, msg text) returns void
language plpgsql as $$
begin
  execute stmt;
exception when others then
  raise exception 'FALLA: % (%)', msg, sqlerrm;
end $$;

create function rls_t.affected(stmt text) returns bigint
language plpgsql as $$
declare n bigint;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
end $$;

create function rls_t.login(p_uid uuid) returns void
language sql as $$ select set_config('request.jwt.claim.sub', p_uid::text, true) $$;

grant execute on all functions in schema rls_t to authenticated, anon;

-- ---------- datos ----------
insert into consent_types (code, name, description) values
  ('performance_data', 't', 't'), ('medical_data', 't', 't'), ('gps_tracking', 't', 't')
on conflict do nothing;

update seasons set is_current = false;
insert into seasons (id, name, starts_on, ends_on, is_current) values
  ('5e000000-0000-4000-8000-000000002026', 'T-2026', '2026-01-01', '2026-12-31', true),
  ('5e000000-0000-4000-8000-000000002025', 'T-2025', '2025-01-01', '2025-12-31', false);

insert into categories (id, code, name, level) values
  ('ca000000-0000-4000-8000-00000000000a', 'T-A', 'Cat A', 'juveniles'),
  ('ca000000-0000-4000-8000-00000000000b', 'T-B', 'Cat B', 'juveniles');

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000001', 'admin@t'),
  ('c0000000-0000-4000-8000-00000000000a', 'coach_a@t'),
  ('c0000000-0000-4000-8000-00000000000b', 'coach_b@t'),
  ('c0000000-0000-4000-8000-0000000000ff', 'coach_off@t'),
  ('d0000000-0000-4000-8000-000000000001', 'medical@t');

update profiles set role = 'admin',   active = true where id = 'a0000000-0000-4000-8000-000000000001';
update profiles set role = 'coach',   active = true where id in ('c0000000-0000-4000-8000-00000000000a', 'c0000000-0000-4000-8000-00000000000b');
update profiles set role = 'medical', active = true where id = 'd0000000-0000-4000-8000-000000000001';
-- coach_off queda inactivo (default)

insert into coach_assignments (profile_id, category_id, season_id) values
  ('c0000000-0000-4000-8000-00000000000a', 'ca000000-0000-4000-8000-00000000000a', '5e000000-0000-4000-8000-000000002026'),
  ('c0000000-0000-4000-8000-00000000000b', 'ca000000-0000-4000-8000-00000000000b', '5e000000-0000-4000-8000-000000002026'),
  ('c0000000-0000-4000-8000-0000000000ff', 'ca000000-0000-4000-8000-00000000000a', '5e000000-0000-4000-8000-000000002026');

insert into players (id, first_name, last_name, birth_date, sex) values
  ('b1000000-0000-4000-8000-0000000000a1', 'A1', 'RLS', '2011-03-01', 'male'),
  ('b1000000-0000-4000-8000-0000000000a2', 'A2', 'RLS', '2011-05-01', 'male'),
  ('b1000000-0000-4000-8000-0000000000b1', 'B1', 'RLS', '2009-05-01', 'male');

insert into player_private (player_id, document_id) values ('b1000000-0000-4000-8000-0000000000a1', '12345678');

insert into player_season_categories (player_id, season_id, category_id) values
  ('b1000000-0000-4000-8000-0000000000a1', '5e000000-0000-4000-8000-000000002026', 'ca000000-0000-4000-8000-00000000000a'),
  ('b1000000-0000-4000-8000-0000000000a2', '5e000000-0000-4000-8000-000000002026', 'ca000000-0000-4000-8000-00000000000a'),
  ('b1000000-0000-4000-8000-0000000000b1', '5e000000-0000-4000-8000-000000002026', 'ca000000-0000-4000-8000-00000000000b'),
  ('b1000000-0000-4000-8000-0000000000a1', '5e000000-0000-4000-8000-000000002025', 'ca000000-0000-4000-8000-00000000000b');

insert into guardians (id, full_name) values ('9a000000-0000-4000-8000-000000000001', 'Tutor RLS');
insert into player_guardians (player_id, guardian_id, relationship)
  select id, '9a000000-0000-4000-8000-000000000001', 'madre' from players where last_name = 'RLS';
insert into consents (player_id, guardian_id, consent_type, document_version)
  select p.id, '9a000000-0000-4000-8000-000000000001', ct, 'v1'
  from players p, unnest(array['performance_data', 'medical_data']) ct
  where p.last_name = 'RLS';

insert into test_types (id, code, name, domain) values
  ('77000000-0000-4000-8000-000000000001', 't_rls_sprint', 'Sprint RLS', 'speed');
insert into test_metrics (id, test_type_id, code, name, unit, higher_is_better, best_of) values
  ('78000000-0000-4000-8000-000000000001', '77000000-0000-4000-8000-000000000001', 't_rls_10', '10 m', 's', false, 'min');

insert into evaluation_sessions (id, season_id, category_id, session_type, session_date) values
  ('5a000000-0000-4000-8000-00000000000a', '5e000000-0000-4000-8000-000000002026', 'ca000000-0000-4000-8000-00000000000a', 'testing', '2026-04-01'),
  ('5a000000-0000-4000-8000-00000000000b', '5e000000-0000-4000-8000-000000002026', 'ca000000-0000-4000-8000-00000000000b', 'testing', '2026-04-01'),
  ('5a000000-0000-4000-8000-0000000000b5', '5e000000-0000-4000-8000-000000002025', 'ca000000-0000-4000-8000-00000000000b', 'testing', '2025-04-01');

insert into results (session_id, player_id, metric_id, value) values
  ('5a000000-0000-4000-8000-00000000000a', 'b1000000-0000-4000-8000-0000000000a1', '78000000-0000-4000-8000-000000000001', 1.90),
  ('5a000000-0000-4000-8000-0000000000b5', 'b1000000-0000-4000-8000-0000000000a1', '78000000-0000-4000-8000-000000000001', 2.05),
  ('5a000000-0000-4000-8000-00000000000b', 'b1000000-0000-4000-8000-0000000000b1', '78000000-0000-4000-8000-000000000001', 1.80);

insert into wellness_logs (player_id, log_date, fatigue, session_rpe, session_minutes) values
  ('b1000000-0000-4000-8000-0000000000a1', '2026-04-02', 3, 6, 80),
  ('b1000000-0000-4000-8000-0000000000b1', '2026-04-02', 4, 5, 70);

insert into injuries (id, player_id, occurred_on, context, body_region, injury_type) values
  ('1e000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-0000000000a1', '2026-04-05', 'match', 'thigh_posterior', 'muscle');
insert into injury_notes (injury_id, note) values ('1e000000-0000-4000-8000-000000000001', 'Desgarro grado I');

-- =====================================================================
-- anon
-- =====================================================================
set local role anon;
select rls_t.throws('select * from public.players', 'anon no lee players');
select rls_t.throws('select * from public.results', 'anon no lee results');
select rls_t.throws($$select * from public.category_benchmarks(gen_random_uuid(), gen_random_uuid())$$, 'anon no ejecuta benchmarks');
reset role;

-- =====================================================================
-- coach_a
-- =====================================================================
set local role authenticated;
select rls_t.login('c0000000-0000-4000-8000-00000000000a');

select rls_t.eq((select count(*) from players where last_name = 'RLS'), 2, 'coach_a ve sólo su categoría');
select rls_t.eq((select count(*) from players where id = 'b1000000-0000-4000-8000-0000000000b1'), 0, 'coach_a no ve jugador de Cat B');
select rls_t.eq((select count(*) from player_private), 0, 'coach_a no ve datos privados');
select rls_t.eq((select count(*) from guardians), 0, 'coach_a no ve tutores');
select rls_t.eq((select count(*) from injury_notes), 0, 'coach_a no ve notas clínicas');
select rls_t.eq((select count(*) from audit_log), 0, 'coach_a no ve auditoría');
select rls_t.eq((select count(*) from consents where player_id = 'b1000000-0000-4000-8000-0000000000a1'), 2, 'coach_a ve estado de consentimientos');

-- historial: el resultado de pA1 en Cat B 2025 se ve (vía jugador visible)
select rls_t.eq((select count(*) from results where player_id = 'b1000000-0000-4000-8000-0000000000a1'), 2, 'coach_a ve historial completo de pA1');
select rls_t.eq((select count(*) from v_session_best where player_id = 'b1000000-0000-4000-8000-0000000000a1'), 2, 'vista conserva historial');
select rls_t.eq((select count(*) from results where player_id = 'b1000000-0000-4000-8000-0000000000b1'), 0, 'coach_a no ve resultados de Cat B');
select rls_t.eq((select count(*) from evaluation_sessions where id = '5a000000-0000-4000-8000-00000000000b'), 0, 'coach_a no ve sesión de Cat B');
select rls_t.eq((select count(*) from wellness_logs where player_id = 'b1000000-0000-4000-8000-0000000000b1'), 0, 'coach_a no ve wellness de Cat B');
select rls_t.eq((select count(*) from injuries where player_id in (select id from players where last_name = 'RLS')), 1, 'coach_a ve la lesión de su jugador');
select rls_t.eq((select count(*) from player_comparison('b1000000-0000-4000-8000-0000000000a1', '78000000-0000-4000-8000-000000000001')), 2, 'comparación de su jugador');
select rls_t.eq((select count(*) from player_comparison('b1000000-0000-4000-8000-0000000000b1', '78000000-0000-4000-8000-000000000001')), 0, 'comparación de jugador ajeno vacía');

-- escritura
select rls_t.ok($$insert into results (session_id, player_id, metric_id, value) values
  ('5a000000-0000-4000-8000-00000000000a', 'b1000000-0000-4000-8000-0000000000a2', '78000000-0000-4000-8000-000000000001', 1.95)$$,
  'coach_a carga en su sesión');
select rls_t.throws($$insert into results (session_id, player_id, metric_id, value) values
  ('5a000000-0000-4000-8000-00000000000b', 'b1000000-0000-4000-8000-0000000000a2', '78000000-0000-4000-8000-000000000001', 1.95)$$,
  'coach_a NO carga en sesión de Cat B');
select rls_t.throws($$insert into results (session_id, player_id, metric_id, value) values
  ('5a000000-0000-4000-8000-0000000000b5', 'b1000000-0000-4000-8000-0000000000a1', '78000000-0000-4000-8000-000000000001', 1.99)$$,
  'coach_a NO carga en sesión histórica de otra categoría');
select rls_t.ok($$insert into evaluation_sessions (season_id, category_id, session_type, session_date) values
  ('5e000000-0000-4000-8000-000000002026', 'ca000000-0000-4000-8000-00000000000a', 'training', '2026-04-10')$$,
  'coach_a crea sesión de su categoría');
select rls_t.throws($$insert into evaluation_sessions (season_id, category_id, session_type, session_date) values
  ('5e000000-0000-4000-8000-000000002026', 'ca000000-0000-4000-8000-00000000000b', 'training', '2026-04-10')$$,
  'coach_a NO crea sesión de Cat B');
select rls_t.eq(rls_t.affected($$delete from results where player_id = 'b1000000-0000-4000-8000-0000000000a1'$$), 0, 'coach_a no borra físicamente');
select rls_t.ok($$insert into wellness_logs (player_id, log_date, fatigue) values ('b1000000-0000-4000-8000-0000000000a2', '2026-04-03', 4)$$, 'coach_a carga wellness');
select rls_t.throws($$insert into wellness_logs (player_id, log_date, fatigue) values ('b1000000-0000-4000-8000-0000000000b1', '2026-04-03', 4)$$, 'coach_a NO carga wellness de Cat B');
select rls_t.ok($$insert into injuries (player_id, occurred_on, context, body_region, injury_type) values
  ('b1000000-0000-4000-8000-0000000000a2', '2026-04-06', 'training', 'ankle', 'ligament')$$, 'coach_a da de alta lesión');
select rls_t.eq(rls_t.affected($$update injuries set status = 'closed'$$), 0, 'coach_a no cambia estado de lesión');
select rls_t.throws($$insert into injury_notes (injury_id, note) values ('1e000000-0000-4000-8000-000000000001', 'x')$$, 'coach_a no escribe notas clínicas');

-- perfiles y jugadores
select rls_t.ok($$update profiles set full_name = 'Coach A' where id = 'c0000000-0000-4000-8000-00000000000a'$$, 'coach_a edita su nombre');
select rls_t.throws($$update profiles set role = 'admin' where id = 'c0000000-0000-4000-8000-00000000000a'$$, 'coach_a NO se hace admin');
select rls_t.eq(rls_t.affected($$update profiles set full_name = 'x' where id = 'c0000000-0000-4000-8000-00000000000b'$$), 0, 'coach_a no edita a otro');
select rls_t.ok($$update players set primary_position_id = null where id = 'b1000000-0000-4000-8000-0000000000a1'$$, 'coach_a edita datos deportivos');
select rls_t.throws($$update players set birth_date = '2012-01-01' where id = 'b1000000-0000-4000-8000-0000000000a1'$$, 'coach_a NO edita fecha de nacimiento');
select rls_t.throws($$insert into players (first_name, last_name, birth_date, sex) values ('X', 'RLS', '2011-01-01', 'male')$$, 'coach_a no crea jugadores');
select rls_t.throws($$insert into coach_assignments (profile_id, category_id, season_id) values
  ('c0000000-0000-4000-8000-00000000000a', 'ca000000-0000-4000-8000-00000000000b', '5e000000-0000-4000-8000-000000002026')$$, 'coach_a NO se asigna otra categoría');
select rls_t.throws($$insert into consents (player_id, guardian_id, consent_type, document_version) values
  ('b1000000-0000-4000-8000-0000000000a1', '9a000000-0000-4000-8000-000000000001', 'gps_tracking', 'v1')$$, 'coach_a no registra consentimientos');
reset role;

-- =====================================================================
-- coach_b: no ve el historial de pA1 en su categoría (no está asignado a 2025)
-- =====================================================================
set local role authenticated;
select rls_t.login('c0000000-0000-4000-8000-00000000000b');
select rls_t.eq((select count(*) from players where last_name = 'RLS'), 1, 'coach_b ve sólo pB1');
select rls_t.eq((select count(*) from results where player_id = 'b1000000-0000-4000-8000-0000000000a1'), 0, 'coach_b no ve resultados de ex-jugador');
select rls_t.eq((select count(*) from evaluation_sessions where id = '5a000000-0000-4000-8000-0000000000b5'), 0, 'coach_b no ve sesión de temporada no asignada');
reset role;

-- =====================================================================
-- coach inactivo
-- =====================================================================
set local role authenticated;
select rls_t.login('c0000000-0000-4000-8000-0000000000ff');
select rls_t.eq((select count(*) from players), 0, 'inactivo no ve jugadores');
select rls_t.eq((select count(*) from evaluation_sessions), 0, 'inactivo no ve sesiones');
select rls_t.eq((select count(*) from test_types), 0, 'inactivo no ve catálogo');
select rls_t.throws($$update profiles set active = true where id = 'c0000000-0000-4000-8000-0000000000ff'$$, 'inactivo no se auto-activa');
reset role;

-- =====================================================================
-- medical
-- =====================================================================
set local role authenticated;
select rls_t.login('d0000000-0000-4000-8000-000000000001');
select rls_t.eq((select count(*) from players where last_name = 'RLS'), 3, 'medical ve todos');
select rls_t.eq((select count(*) from player_private where player_id = 'b1000000-0000-4000-8000-0000000000a1'), 1, 'medical ve datos privados');
select rls_t.eq((select count(*) from injury_notes where injury_id = '1e000000-0000-4000-8000-000000000001'), 1, 'medical ve notas clínicas');
select rls_t.eq(rls_t.affected($$update injuries set status = 'rehab' where id = '1e000000-0000-4000-8000-000000000001'$$), 1, 'medical gestiona lesiones');
select rls_t.throws($$insert into results (session_id, player_id, metric_id, value) values
  ('5a000000-0000-4000-8000-00000000000a', 'b1000000-0000-4000-8000-0000000000a1', '78000000-0000-4000-8000-000000000001', 1.7)$$,
  'medical no carga resultados');
select rls_t.eq((select count(*) from audit_log), 0, 'medical no ve auditoría');
reset role;

-- =====================================================================
-- admin
-- =====================================================================
set local role authenticated;
select rls_t.login('a0000000-0000-4000-8000-000000000001');
select rls_t.eq((select count(*) from players where last_name = 'RLS'), 3, 'admin ve todos');
select rls_t.eq((select count(*) > 0 from audit_log)::int, 1, 'admin ve auditoría');
select rls_t.throws($$insert into audit_log (table_name, operation) values ('x', 'INSERT')$$, 'nadie escribe audit_log por API');
select rls_t.ok($$insert into consents (player_id, guardian_id, consent_type, document_version) values
  ('b1000000-0000-4000-8000-0000000000a1', '9a000000-0000-4000-8000-000000000001', 'gps_tracking', 'v1')$$, 'admin registra consentimiento');
reset role;

do $$ begin raise notice '02_rls: OK'; end $$;
rollback;
