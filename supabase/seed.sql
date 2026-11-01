-- =====================================================================
-- ORC · seed.sql  (SOLO desarrollo local: lo corre `supabase db reset`)
--
-- 1. Temporada y categorías de ejemplo
-- 2. DEMO: usuarios, jugadores ficticios, tutores, consentimientos,
--    sesiones, resultados, bienestar y lesiones.
--
-- El catálogo de tests/puestos/consentimientos está en la migración
-- *_reference_catalog.sql (también se necesita en producción).
--
-- Usuarios demo (contraseña: orc-demo-2026)
--   admin@orc.test        admin
--   profe.m15@orc.test    coach M15
--   profe.m17@orc.test    coach M17
--   profe.primera@orc.test coach Primera + Intermedia
--   medico@orc.test       medical
--
-- ⚠ TODOS LOS JUGADORES SON FICTICIOS. Los valores se generan con una
--   semilla fija (resultado reproducible) y sólo sirven para probar la app.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Temporada y categorías
-- ---------------------------------------------------------------------
insert into public.seasons (id, name, starts_on, ends_on, is_current) values
  ('00000000-0000-4000-a000-000000002026', '2026', '2026-01-01', '2026-12-31', true)
on conflict (name) do nothing;

insert into public.categories (code, name, level, max_age, sort_order) values
  ('M12',        'Menores de 12', 'infantiles',       12,   10),
  ('M14',        'Menores de 14', 'juveniles',        14,   20),
  ('M15',        'Menores de 15', 'juveniles',        15,   30),
  ('M16',        'Menores de 16', 'juveniles',        16,   40),
  ('M17',        'Menores de 17', 'juveniles',        17,   50),
  ('M19',        'Menores de 19', 'juveniles',        19,   60),
  ('INTERMEDIA', 'Intermedia',    'plantel_superior', null, 90),
  ('PRIMERA',    'Primera',       'plantel_superior', null, 100)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- 2. DEMO · usuarios
-- ---------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token,
  email_change, email_change_token_new, created_at, updated_at
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt('orc-demo-2026', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', u.full_name), '', '', '', '', now(), now()
from (values
  ('d0000000-0000-4000-a000-000000000001'::uuid, 'admin@orc.test',         'Admin Demo'),
  ('d0000000-0000-4000-a000-000000000015'::uuid, 'profe.m15@orc.test',     'Profe M15 Demo'),
  ('d0000000-0000-4000-a000-000000000017'::uuid, 'profe.m17@orc.test',     'Profe M17 Demo'),
  ('d0000000-0000-4000-a000-000000000100'::uuid, 'profe.primera@orc.test', 'Profe Primera Demo'),
  ('d0000000-0000-4000-a000-0000000000ed'::uuid, 'medico@orc.test',        'Médico Demo')
) as u (id, email, full_name)
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.email like '%@orc.test'
on conflict (provider_id, provider) do nothing;

update public.profiles p
   set role = v.role::public.app_role, active = true
  from (values
    ('d0000000-0000-4000-a000-000000000001'::uuid, 'admin'),
    ('d0000000-0000-4000-a000-000000000015'::uuid, 'coach'),
    ('d0000000-0000-4000-a000-000000000017'::uuid, 'coach'),
    ('d0000000-0000-4000-a000-000000000100'::uuid, 'coach'),
    ('d0000000-0000-4000-a000-0000000000ed'::uuid, 'medical')
  ) as v (id, role)
 where p.id = v.id;

insert into public.coach_assignments (profile_id, category_id, season_id, is_head)
select v.profile_id, c.id, '00000000-0000-4000-a000-000000002026', true
from (values
  ('d0000000-0000-4000-a000-000000000015'::uuid, 'M15'),
  ('d0000000-0000-4000-a000-000000000017'::uuid, 'M17'),
  ('d0000000-0000-4000-a000-000000000100'::uuid, 'PRIMERA'),
  ('d0000000-0000-4000-a000-000000000100'::uuid, 'INTERMEDIA')
) as v (profile_id, cat)
join public.categories c on c.code = v.cat
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 2. DEMO · jugadores y datos
-- ---------------------------------------------------------------------
-- Normal aproximada (suma de 4 uniformes) con semilla fija.
create function pg_temp.n(p_mean numeric, p_sd numeric)
returns numeric language sql volatile as $$
  select p_mean + p_sd * ((random() + random() + random() + random() - 2) * 1.732)::numeric
$$;

-- Inserta un resultado ajustando decimales y rango de la métrica.
create function pg_temp.r(p_session uuid, p_player uuid, p_metric text, p_value numeric, p_attempt int default 1)
returns void language plpgsql as $$
declare m public.test_metrics%rowtype;
begin
  select * into m from public.test_metrics where code = p_metric;
  insert into public.results (session_id, player_id, metric_id, attempt, value)
  values (p_session, p_player, m.id, p_attempt,
          round(greatest(coalesce(m.min_valid, p_value), least(coalesce(m.max_valid, p_value), p_value)), m.decimals));
end $$;

do $$
declare
  v_season   uuid := '00000000-0000-4000-a000-000000002026';
  first_names text[] := array['Tomás','Santiago','Mateo','Benjamín','Joaquín','Felipe','Lautaro','Agustín',
                              'Bautista','Facundo','Ignacio','Valentín','Nicolás','Juan Cruz','Franco'];
  last_names  text[] := array['García','Fernández','López','Martínez','González','Rodríguez','Pérez','Sánchez',
                              'Romero','Sosa','Álvarez','Torres','Ruiz','Ramírez','Acosta','Benítez','Medina',
                              'Herrera','Aguirre','Giménez'];
  cat        record;
  v_cat      uuid;
  v_player   uuid;
  v_guard    uuid;
  v_fwd      boolean;
  v_s1       uuid; v_s2 uuid; v_match uuid;
  v_sess     uuid;
  v_ht       numeric; v_wt numeric; v_t10 numeric; v_cmj numeric; v_dist numeric; v_sq numeric; v_505 numeric;
  v_gain     numeric;
  i          int; a int; d int; k int := 0;
begin
  perform setseed(0.2026);

  for cat in
    select * from (values
      ('M15',     2011, 168.0, 60.0, 1.86, 32.0, 1150.0, 0.0,   2.48, 70),
      ('M17',     2009, 175.5, 73.0, 1.79, 38.0, 1450.0, 85.0,  2.40, 70),
      ('PRIMERA', 2000, 181.0, 92.0, 1.73, 44.0, 1800.0, 125.0, 2.33, 80)
    ) as t (code, birth_year, ht, wt, t10, cmj, dist, sq, t505, match_min)
  loop
    select id into v_cat from public.categories where code = cat.code;

    -- Sesiones: dos testeos (marzo/junio) y un partido
    insert into public.evaluation_sessions (season_id, category_id, session_type, session_date, title, location)
      values (v_season, v_cat, 'testing', '2026-03-14', 'Testeo pretemporada', 'Club - cancha 1')
      returning id into v_s1;
    insert into public.evaluation_sessions (season_id, category_id, session_type, session_date, title, location)
      values (v_season, v_cat, 'testing', '2026-06-13', 'Testeo mitad de temporada', 'Club - cancha 1')
      returning id into v_s2;
    insert into public.evaluation_sessions (season_id, category_id, session_type, session_date, title, opponent)
      values (v_season, v_cat, 'match', '2026-05-09', 'Fecha 6', 'Club Rival Demo')
      returning id into v_match;

    for i in 1..15 loop
      k := k + 1;
      v_fwd := i <= 8;

      insert into public.players (first_name, last_name, birth_date, sex, dominant_side, primary_position_id)
      values (
        first_names[1 + (k * 7) % array_length(first_names, 1)],
        last_names[1 + (k * 11) % array_length(last_names, 1)] || ' (demo)',
        make_date(cat.birth_year + case when cat.code = 'PRIMERA' then -(k % 6) else 0 end, 1 + (k * 5) % 12, 1 + (k * 3) % 28),
        'male',
        case when k % 6 = 0 then 'left' else 'right' end::public.body_side,
        i
      )
      returning id into v_player;

      insert into public.player_season_categories (player_id, season_id, category_id, position_id, jersey_number)
      values (v_player, v_season, v_cat, i, i);

      -- Consentimientos: menores vía tutor; mayores por sí mismos
      if cat.code <> 'PRIMERA' then
        insert into public.guardians (full_name, phone)
          values ('Tutor de ' || first_names[1 + (k * 7) % 15] || ' (demo)', '+54 9 11 0000-' || lpad(k::text, 4, '0'))
          returning id into v_guard;
        insert into public.player_guardians (player_id, guardian_id, relationship, is_primary)
          values (v_player, v_guard, case when k % 2 = 0 then 'madre' else 'padre' end, true);
      else
        v_guard := null;
      end if;

      insert into public.consents (player_id, guardian_id, consent_type, document_version, granted_at)
      select v_player, v_guard, ct, '2026-v1', timestamptz '2026-02-20 10:00-03'
      from unnest(case when cat.code = 'PRIMERA'
                       then array['performance_data', 'medical_data', 'gps_tracking']
                       else array['performance_data', 'medical_data'] end) ct;
      -- Un jugador de M15 sin consentimiento de salud (para probar el bloqueo en la app)
      if cat.code = 'M15' and i = 15 then
        update public.consents set revoked_at = timestamptz '2026-04-01 10:00-03'
         where player_id = v_player and consent_type = 'medical_data';
      end if;

      -- Base individual
      v_ht   := pg_temp.n(cat.ht + case when v_fwd then 3 else -2 end, 5);
      v_wt   := pg_temp.n(cat.wt + case when v_fwd then 12 else -6 end, 6);
      v_t10  := pg_temp.n(cat.t10 + case when v_fwd then 0.05 else -0.05 end, 0.05);
      v_cmj  := pg_temp.n(cat.cmj + case when v_fwd then -2 else 3 end, 3.5);
      v_dist := pg_temp.n(cat.dist + case when v_fwd then -150 else 150 end, 220);
      v_sq   := pg_temp.n(cat.sq + case when v_fwd then 15 else -5 end, 12);
      v_505  := pg_temp.n(cat.t505 + case when v_fwd then 0.06 else -0.04 end, 0.07);

      foreach v_sess in array array[v_s1, v_s2] loop
        -- en junio: crecimiento en inferiores y mejora de entrenamiento
        v_gain := case when v_sess = v_s2 then 1 else 0 end;

        -- Antropometría
        perform pg_temp.r(v_sess, v_player, 'height_cm',
          v_ht + v_gain * case when cat.code = 'PRIMERA' then 0 else pg_temp.n(1.6, 0.5) end);
        perform pg_temp.r(v_sess, v_player, 'sitting_height_cm', (v_ht + v_gain) * pg_temp.n(0.522, 0.008));
        perform pg_temp.r(v_sess, v_player, 'weight_kg', v_wt + v_gain * pg_temp.n(1.5, 1));
        perform pg_temp.r(v_sess, v_player, 'body_fat_pct',
          pg_temp.n(case when v_fwd then 17 else 12 end, 3) - v_gain * 0.6);

        -- Sprint: 2 intentos
        for a in 1..2 loop
          perform pg_temp.r(v_sess, v_player, 'sprint_10m_s', v_t10 - v_gain * 0.03 + pg_temp.n(0, 0.03), a);
          perform pg_temp.r(v_sess, v_player, 'sprint_20m_s', (v_t10 - v_gain * 0.03) * 1.71 + pg_temp.n(0, 0.04), a);
          perform pg_temp.r(v_sess, v_player, 'sprint_40m_s', (v_t10 - v_gain * 0.03) * 3.03 + pg_temp.n(0, 0.06), a);
        end loop;

        -- CMJ: 3 intentos
        for a in 1..3 loop
          perform pg_temp.r(v_sess, v_player, 'cmj_height_cm', v_cmj + v_gain * 1.5 + pg_temp.n(0, 1.5), a);
        end loop;

        -- 505: 2 intentos por lado
        for a in 1..2 loop
          perform pg_temp.r(v_sess, v_player, 'agility_505_left_s',  v_505 - v_gain * 0.04 + pg_temp.n(0, 0.04), a);
          perform pg_temp.r(v_sess, v_player, 'agility_505_right_s', v_505 - v_gain * 0.04 + pg_temp.n(0, 0.04), a);
        end loop;

        -- Yo-Yo IR1 (distancia múltiplo de 40 m; el VO2máx lo calcula la base)
        perform pg_temp.r(v_sess, v_player, 'yoyo_ir1_distance_m',
          round((v_dist + v_gain * pg_temp.n(160, 80)) / 40) * 40);

        -- Fuerza (no en M15): carga submáxima y reps => 1RM estimado
        if cat.sq > 0 then
          perform pg_temp.r(v_sess, v_player, 'back_squat_load_kg',
            round((v_sq + v_gain * pg_temp.n(6, 3)) * 0.85 / 2.5) * 2.5);
          perform pg_temp.r(v_sess, v_player, 'back_squat_reps', (3 + floor(random() * 4))::numeric);
          perform pg_temp.r(v_sess, v_player, 'pull_ups_reps', greatest(0, pg_temp.n(case when v_fwd then 7 else 11 end, 3)));
        end if;
      end loop;

      -- Partido
      perform pg_temp.r(v_match, v_player, 'minutes_played', least(cat.match_min, greatest(10, pg_temp.n(cat.match_min - 10, 15))));
      perform pg_temp.r(v_match, v_player, 'tackles_made', greatest(0, pg_temp.n(case when v_fwd then 9 else 6 end, 3)));
      perform pg_temp.r(v_match, v_player, 'tackles_missed', greatest(0, pg_temp.n(1.5, 1.2)));
      perform pg_temp.r(v_match, v_player, 'ruck_arrivals', greatest(0, pg_temp.n(case when v_fwd then 18 else 7 end, 5)));
      perform pg_temp.r(v_match, v_player, 'carries', greatest(0, pg_temp.n(case when v_fwd then 7 else 9 end, 3)));
      if cat.code = 'PRIMERA' then
        perform pg_temp.r(v_match, v_player, 'gps_total_distance_m', pg_temp.n(case when v_fwd then 5400 else 6300 end, 500));
        perform pg_temp.r(v_match, v_player, 'gps_hsr_m', pg_temp.n(case when v_fwd then 280 else 620 end, 120));
        perform pg_temp.r(v_match, v_player, 'gps_max_speed_kmh', pg_temp.n(case when v_fwd then 27 else 31.5 end, 1.5));
        perform pg_temp.r(v_match, v_player, 'gps_sprints', greatest(0, pg_temp.n(case when v_fwd then 6 else 14 end, 3)));
      end if;

      -- Bienestar: 6 semanas (lun/mié/jue/sáb), M17 y Primera
      if cat.code in ('M17', 'PRIMERA') then
        for d in 0..41 loop
          if extract(isodow from date '2026-05-04' + d) in (1, 3, 4, 6) then
            insert into public.wellness_logs (
              player_id, log_date, sleep_hours, sleep_quality, fatigue, soreness, stress, mood,
              session_rpe, session_minutes)
            values (
              v_player, date '2026-05-04' + d,
              round(least(11, greatest(4, pg_temp.n(7.6, 0.9))), 1),
              least(5, greatest(1, round(pg_temp.n(3.8, 0.8))))::smallint,
              least(5, greatest(1, round(pg_temp.n(3.4, 0.8))))::smallint,
              least(5, greatest(1, round(pg_temp.n(3.3, 0.9))))::smallint,
              least(5, greatest(1, round(pg_temp.n(3.9, 0.7))))::smallint,
              least(5, greatest(1, round(pg_temp.n(4.0, 0.7))))::smallint,
              least(10, greatest(1, round(pg_temp.n(
                case when extract(isodow from date '2026-05-04' + d) = 6 then 8 else 5.5 end, 1.2))))::smallint,
              case when extract(isodow from date '2026-05-04' + d) = 6 then cat.match_min else 85 end
            );
          end if;
        end loop;
      end if;

      -- Lesiones de ejemplo
      if (cat.code = 'M17' and i = 4) then
        insert into public.injuries (player_id, occurred_on, context, session_id, body_region, injury_type,
                                     side, mechanism, status, expected_return, summary)
        values (v_player, '2026-05-09', 'match', v_match, 'ankle', 'ligament', 'right', 'contact',
                'rehab', '2026-06-06', 'Esguince tobillo derecho en ruck');
      elsif (cat.code = 'PRIMERA' and i = 12) then
        insert into public.injuries (player_id, occurred_on, context, body_region, injury_type,
                                     side, mechanism, status, expected_return, actual_return, summary)
        values (v_player, '2026-04-02', 'training', 'thigh_posterior', 'muscle', 'left', 'non_contact',
                'closed', '2026-04-23', '2026-04-27', 'Molestia isquiotibial izquierdo en sprint');
      elsif (cat.code = 'M15' and i = 2) then
        insert into public.injuries (player_id, occurred_on, context, body_region, injury_type,
                                     mechanism, status, expected_return, summary)
        values (v_player, '2026-05-09', 'match', 'head', 'concussion', 'contact',
                'return_to_play', '2026-05-30', 'Conmoción: protocolo de regreso gradual');
      end if;
    end loop;
  end loop;

  -- Nota clínica de ejemplo (sólo visible para medical/admin)
  insert into public.injury_notes (injury_id, note, diagnosis, treatment)
  select id, 'Evaluación inicial post partido.', 'Esguince grado II LLE', 'Kinesiología 3x semana, propiocepción'
  from public.injuries where summary like 'Esguince tobillo%';
end
$$;

drop function pg_temp.r(uuid, uuid, text, numeric, int);
drop function pg_temp.n(numeric, numeric);
