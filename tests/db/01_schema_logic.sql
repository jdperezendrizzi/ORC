-- =====================================================================
-- Tests de lógica del esquema (independientes del seed).
-- Corren dentro de una transacción con ROLLBACK: no dejan datos.
-- Ejecutar: scripts/db/verify.sh
-- =====================================================================
begin;

do $$
declare
  v_season  uuid;
  v_cat     uuid;
  v_sess    uuid;
  v_sess2   uuid;
  v_p       uuid[] := array[]::uuid[];
  v_g       uuid;
  v_tt_sq   uuid;
  v_tt_ant  uuid;
  v_tt_sp   uuid;
  m_load    uuid; m_reps uuid; m_e1rm uuid;
  m_ht      uuid; m_sh   uuid; m_wt   uuid; m_off uuid;
  m_s10     uuid;
  v_val     numeric;
  v_cnt     int;
  v_ok      boolean;
  i         int;
begin
  -- ---------- datos mínimos ----------
  insert into consent_types (code, name, description) values
    ('performance_data', 't', 't'), ('medical_data', 't', 't'), ('gps_tracking', 't', 't')
  on conflict do nothing;
  insert into positions (id, name, short_name, unit, line) values
    (1, 'T Pilar izquierdo', 'PI', 'forwards', 'front_row'),
    (10, 'T Apertura', 'AP', 'backs', 'halves')
  on conflict do nothing;

  insert into seasons (name, starts_on, ends_on) values ('T-2026', '2026-01-01', '2026-12-31')
    returning id into v_season;
  insert into categories (code, name, level, max_age) values ('T-M15', 'Test M15', 'juveniles', 15)
    returning id into v_cat;

  insert into test_types (code, name, domain) values ('t_squat', 'Sentadilla', 'strength') returning id into v_tt_sq;
  insert into test_metrics (test_type_id, code, name, unit, higher_is_better, input_role, min_valid, max_valid)
    values (v_tt_sq, 't_sq_load', 'Carga', 'kg', true, 'load', 0, 400) returning id into m_load;
  insert into test_metrics (test_type_id, code, name, unit, higher_is_better, input_role, decimals)
    values (v_tt_sq, 't_sq_reps', 'Reps', 'reps', true, 'reps', 0) returning id into m_reps;
  insert into test_metrics (test_type_id, code, name, unit, higher_is_better, derivation)
    values (v_tt_sq, 't_sq_e1rm', '1RM est.', 'kg', true, 'epley_1rm') returning id into m_e1rm;

  insert into test_types (code, name, domain) values ('t_anthro', 'Antropometría', 'anthropometry') returning id into v_tt_ant;
  insert into test_metrics (test_type_id, code, name, unit, higher_is_better, input_role, best_of)
    values (v_tt_ant, 't_ht', 'Talla', 'cm', true, 'height', 'last') returning id into m_ht;
  insert into test_metrics (test_type_id, code, name, unit, higher_is_better, input_role, best_of)
    values (v_tt_ant, 't_sh', 'Talla sentada', 'cm', true, 'sitting_height', 'last') returning id into m_sh;
  insert into test_metrics (test_type_id, code, name, unit, higher_is_better, input_role, best_of)
    values (v_tt_ant, 't_wt', 'Peso', 'kg', true, 'weight', 'last') returning id into m_wt;
  insert into test_metrics (test_type_id, code, name, unit, higher_is_better, derivation, best_of, decimals)
    values (v_tt_ant, 't_offset', 'Offset PHV', 'años', true, 'mirwald_offset', 'last', 2) returning id into m_off;

  insert into test_types (code, name, domain) values ('t_sprint', 'Sprint', 'speed') returning id into v_tt_sp;
  insert into test_metrics (test_type_id, code, name, unit, higher_is_better, best_of, decimals, min_valid, max_valid)
    values (v_tt_sp, 't_s10', '10 m', 's', false, 'min', 2, 1.2, 4) returning id into m_s10;

  for i in 1..4 loop
    insert into players (first_name, last_name, birth_date, sex, primary_position_id)
      values ('J' || i, 'Test', date '2011-06-01', 'male', case when i <= 2 then 1 else 10 end)
      returning id into v_g;
    v_p := v_p || v_g;
    insert into player_season_categories (player_id, season_id, category_id)
      values (v_p[i], v_season, v_cat);
  end loop;

  insert into evaluation_sessions (season_id, category_id, session_type, session_date)
    values (v_season, v_cat, 'testing', '2026-04-10') returning id into v_sess;

  -- ---------- 1. sin consentimiento => bloqueo ----------
  v_ok := false;
  begin
    insert into results (session_id, player_id, metric_id, value) values (v_sess, v_p[1], m_load, 80);
  exception when others then
    v_ok := sqlerrm like '%consentimiento%';
  end;
  assert v_ok, 'Debe bloquear la carga sin consentimiento';

  -- ---------- 2. menor sin tutor => no se puede registrar consentimiento ----------
  v_ok := false;
  begin
    insert into consents (player_id, consent_type, document_version) values (v_p[1], 'performance_data', 'v1');
  exception when others then v_ok := true;
  end;
  assert v_ok, 'Un menor no puede consentir sin tutor';

  insert into guardians (full_name) values ('Tutor Test') returning id into v_g;
  for i in 1..4 loop
    insert into player_guardians (player_id, guardian_id, relationship) values (v_p[i], v_g, 'madre');
    insert into consents (player_id, guardian_id, consent_type, document_version)
      values (v_p[i], v_g, 'performance_data', 'v1');
  end loop;

  -- ---------- 3. 1RM Epley derivado ----------
  insert into results (session_id, player_id, metric_id, value) values (v_sess, v_p[1], m_load, 80);
  insert into results (session_id, player_id, metric_id, value) values (v_sess, v_p[1], m_reps, 5);
  select value into v_val from results
   where session_id = v_sess and player_id = v_p[1] and metric_id = m_e1rm and deleted_at is null;
  assert v_val = 93.3, format('e1RM esperado 93.3, obtuvo %s', v_val);

  -- actualizar reps recalcula
  update results set value = 1 where session_id = v_sess and player_id = v_p[1] and metric_id = m_reps;
  select value into v_val from results
   where session_id = v_sess and player_id = v_p[1] and metric_id = m_e1rm and deleted_at is null;
  assert v_val = 80, format('e1RM con 1 rep debe ser la carga, obtuvo %s', v_val);

  -- soft-delete del insumo elimina la derivada
  update results set deleted_at = now() where session_id = v_sess and player_id = v_p[1] and metric_id = m_reps;
  select count(*) into v_cnt from results
   where session_id = v_sess and player_id = v_p[1] and metric_id = m_e1rm and deleted_at is null;
  assert v_cnt = 0, 'Sin reps no debe existir e1RM';

  -- ---------- 4. derivada no se carga a mano ----------
  v_ok := false;
  begin
    insert into results (session_id, player_id, metric_id, value) values (v_sess, v_p[2], m_e1rm, 100);
  exception when others then v_ok := sqlerrm like '%calculada%';
  end;
  assert v_ok, 'No se debe poder cargar una métrica derivada';

  -- ---------- 5. rango inválido ----------
  v_ok := false;
  begin
    insert into results (session_id, player_id, metric_id, value) values (v_sess, v_p[2], m_s10, 19.5);
  exception when others then v_ok := sqlerrm like '%fuera de rango%';
  end;
  assert v_ok, 'Debe rechazar 19.5 s en 10 m';

  -- ---------- 6. snapshots ----------
  insert into results (session_id, player_id, metric_id, value) values (v_sess, v_p[3], m_s10, 1.95);
  select count(*) into v_cnt from results
   where player_id = v_p[3] and category_id = v_cat and position_id = 10;
  assert v_cnt = 1, 'Snapshot de categoría/puesto';

  -- ---------- 7. Mirwald + peso corporal para fuerza ----------
  insert into results (session_id, player_id, metric_id, value) values
    (v_sess, v_p[2], m_ht, 165), (v_sess, v_p[2], m_sh, 84), (v_sess, v_p[2], m_wt, 55);
  select maturity_offset into v_val from v_maturation where player_id = v_p[2];
  -- edad 14.86: offset ≈ 0.4 (circa-PHV)
  assert v_val between -0.5 and 1.5, format('Offset Mirwald fuera de lo esperado: %s', v_val);

  insert into evaluation_sessions (season_id, category_id, session_type, session_date)
    values (v_season, v_cat, 'testing', '2026-05-01') returning id into v_sess2;
  insert into results (session_id, player_id, metric_id, value) values (v_sess2, v_p[2], m_load, 70);
  select bodyweight_kg into v_val from results where session_id = v_sess2 and player_id = v_p[2];
  assert v_val = 55, 'Debe tomar el peso de la última antropometría';

  -- ---------- 8. idempotencia offline (mismo id, reenvío) ----------
  insert into results (id, session_id, player_id, metric_id, value)
    values ('00000000-0000-4000-8000-000000000001', v_sess, v_p[4], m_s10, 2.10)
    on conflict (id) do update set value = excluded.value;
  insert into results (id, session_id, player_id, metric_id, value)
    values ('00000000-0000-4000-8000-000000000001', v_sess, v_p[4], m_s10, 2.10)
    on conflict (id) do update set value = excluded.value;
  select count(*) into v_cnt from results where player_id = v_p[4];
  assert v_cnt = 1, 'Reenvío del mismo id no duplica';

  -- ---------- 9. benchmarks / comparación ----------
  insert into results (session_id, player_id, metric_id, attempt, value) values
    (v_sess, v_p[1], m_s10, 1, 1.90), (v_sess, v_p[1], m_s10, 2, 1.85),
    (v_sess, v_p[2], m_s10, 1, 2.00);
  -- (no hay auth.uid() => la función no devuelve nada)
  select count(*) into v_cnt from category_benchmarks(v_season, m_s10);
  assert v_cnt = 0, 'Sin usuario staff no hay benchmarks';

  -- simulamos admin
  insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000aa', 'a@test');
  update profiles set role = 'admin', active = true where id = '00000000-0000-4000-8000-0000000000aa';
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000aa', true);

  select n, mean into v_cnt, v_val from category_benchmarks(v_season, m_s10)
   where group_type = 'category';
  -- mejores: 1.85, 2.00, 1.95, 2.10 => media 1.975
  assert v_cnt = 4 and v_val = 1.975, format('Benchmark categoría n=%s mean=%s', v_cnt, v_val);

  select z_category into v_val from player_comparison(v_p[1], m_s10);
  assert v_val > 0, format('1.85 s es mejor que la media => z positivo (z=%s)', v_val);

  -- ---------- 10. auditoría ----------
  select count(*) into v_cnt from audit_log where table_name = 'consents';
  assert v_cnt >= 4, 'Consentimientos auditados';

  raise notice '01_schema_logic: OK';
end
$$;

rollback;
