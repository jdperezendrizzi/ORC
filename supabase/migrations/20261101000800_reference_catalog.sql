-- =====================================================================
-- 0008 · Catálogo de referencia (datos que necesita producción):
--        puestos, tipos de consentimiento, tests y métricas.
--
-- Va como migración (no en seed.sql) porque `supabase db push` no corre
-- seeds. Es idempotente: upsert por clave natural (id / code).
-- Rangos min/max_valid: límites de plausibilidad para frenar errores de
-- tipeo en la cancha, NO normas de rendimiento.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Puestos
-- ---------------------------------------------------------------------
insert into public.positions (id, name, short_name, unit, line) values
  (1,  'Pilar izquierdo',  'PI',  'forwards', 'front_row'),
  (2,  'Hooker',           'HK',  'forwards', 'front_row'),
  (3,  'Pilar derecho',    'PD',  'forwards', 'front_row'),
  (4,  'Segunda línea 4',  '2L4', 'forwards', 'second_row'),
  (5,  'Segunda línea 5',  '2L5', 'forwards', 'second_row'),
  (6,  'Ala 6',            'A6',  'forwards', 'back_row'),
  (7,  'Ala 7',            'A7',  'forwards', 'back_row'),
  (8,  'Octavo',           '8',   'forwards', 'back_row'),
  (9,  'Medio scrum',      'MS',  'backs',    'halves'),
  (10, 'Apertura',         'AP',  'backs',    'halves'),
  (11, 'Wing izquierdo',   'WI',  'backs',    'back_three'),
  (12, 'Primer centro',    'C12', 'backs',    'centres'),
  (13, 'Segundo centro',   'C13', 'backs',    'centres'),
  (14, 'Wing derecho',     'WD',  'backs',    'back_three'),
  (15, 'Fullback',         'FB',  'backs',    'back_three')
on conflict (id) do update
  set name = excluded.name, short_name = excluded.short_name,
      unit = excluded.unit, line = excluded.line;

-- ---------------------------------------------------------------------
-- Tipos de consentimiento
-- ---------------------------------------------------------------------
insert into public.consent_types (code, name, description, required) values
  ('performance_data',    'Datos de rendimiento',
   'Registro y análisis de evaluaciones físicas, estadísticas de juego y bienestar.', true),
  ('medical_data',        'Datos de salud y lesiones',
   'Registro de lesiones, evolución y notas del área médica.', true),
  ('gps_tracking',        'Monitoreo GPS',
   'Uso de dispositivos GPS y registro de carga externa.', false),
  ('image_use',           'Uso de imagen',
   'Fotos/videos del jugador en la plataforma y comunicaciones del club.', false),
  ('data_sharing_family', 'Acceso de la familia',
   'Habilita que el tutor vea los datos del jugador en la app.', false)
on conflict (code) do update
  set name = excluded.name, description = excluded.description, required = excluded.required;

-- ---------------------------------------------------------------------
-- Tipos de test
-- ---------------------------------------------------------------------
insert into public.test_types (code, name, domain, protocol, min_age, sort_order) values
  ('anthropometry', 'Antropometría', 'anthropometry',
   'Talla y talla sentada descalzo (cm, 0.1). Peso en ropa liviana (kg, 0.1). % graso por pliegues o bioimpedancia, siempre con el mismo método. Talla sentada habilita el cálculo de maduración (Mirwald).',
   null, 10),
  ('back_squat', 'Sentadilla trasera', 'strength',
   'Carga y repeticiones (1–12) hasta técnica correcta. 1 rep = 1RM directo; >1 rep = 1RM estimado (Epley). En inferiores priorizar submáximo (3–8 reps).',
   14, 20),
  ('bench_press', 'Press de banca', 'strength',
   'Carga y repeticiones (1–12). 1RM directo o estimado (Epley).', 14, 21),
  ('deadlift', 'Peso muerto', 'strength',
   'Carga y repeticiones (1–12). Barra hexagonal o convencional: registrar siempre la misma variante.', 14, 22),
  ('pull_ups', 'Dominadas', 'strength',
   'Máximas repeticiones con agarre prono, extensión completa de codos, mentón sobre la barra.', null, 23),
  ('grip_strength', 'Fuerza de agarre', 'strength',
   'Dinamómetro de mano, de pie, brazo extendido al costado. Mejor de 2–3 intentos por mano.', null, 24),
  ('sprint_40', 'Sprint 10/20/40 m', 'speed',
   'Salida de pie a 0.5 m de la primera fotocélula. Parciales a 10, 20 y 40 m. 2–3 intentos con 3 min de pausa.',
   null, 30),
  ('cmj', 'Salto con contramovimiento (CMJ)', 'power',
   'Manos en la cintura. Plataforma de contacto o app validada. Mejor de 3 intentos.', null, 40),
  ('reaction', 'Test de reacción', 'power',
   'Tiempo de reacción a estímulo visual (luces / app). Promedio de los intentos válidos.', null, 41),
  ('agility_505', 'Agilidad 505', 'agility',
   'Carrera de 10 m de lanzamiento + 5 m ida y vuelta con giro de 180°. Cronometrado sólo los 5 + 5 m. Ambos lados.',
   null, 50),
  ('t_test', 'T-Test', 'agility',
   'Recorrido en T (10 m + 5 m laterales). Desplazamiento frontal, lateral y de espaldas.', null, 51),
  ('yoyo_ir1', 'Yo-Yo IR1', 'endurance',
   'Carreras 2 × 20 m con 10 s de recuperación activa. Registrar nivel alcanzado (ej. 17.4) y distancia total.',
   null, 60),
  ('ift_30_15', '30-15 IFT', 'endurance',
   'Test intermitente 30 s carrera / 15 s pausa (Buchheit). Registrar la velocidad de la última etapa completa (VIFT).',
   null, 61),
  ('match_stats', 'Estadísticas de partido', 'rugby',
   'Una fila por jugador y partido. Minutos jugados y acciones de juego (codificación de video o planilla).',
   null, 70),
  ('gps_load', 'Carga GPS', 'rugby',
   'Datos del dispositivo GPS por sesión. HSR = distancia a > 5.5 m/s. Requiere consentimiento de monitoreo GPS.',
   null, 71)
on conflict (code) do update
  set name = excluded.name, domain = excluded.domain, protocol = excluded.protocol,
      min_age = excluded.min_age, sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------
-- Métricas
-- ---------------------------------------------------------------------
insert into public.test_metrics (
  test_type_id, code, name, unit, higher_is_better, decimals, min_valid, max_valid,
  is_primary, best_of, input_role, derivation, required_consent, sort_order
)
select tt.id, m.code, m.name, m.unit, m.hib, m.dec, m.min_v, m.max_v,
       m.prim, m.best::public.best_of_rule, m.role, m.deriv::public.metric_derivation,
       m.consent, m.ord
from (values
  -- test               code                    nombre                       unidad      hib    dec  min    max     prim   best    role              derivación          consent             orden
  ('anthropometry', 'height_cm',              'Talla',                     'cm',       true,  1,   100,   220,    true,  'last', 'height',         null,               'performance_data', 1),
  ('anthropometry', 'sitting_height_cm',      'Talla sentada',             'cm',       true,  1,   50,    120,    false, 'last', 'sitting_height', null,               'performance_data', 2),
  ('anthropometry', 'weight_kg',              'Peso',                      'kg',       true,  1,   20,    180,    false, 'last', 'weight',         null,               'performance_data', 3),
  ('anthropometry', 'body_fat_pct',           '% graso',                   '%',        false, 1,   3,     50,     false, 'last', null,             null,               'performance_data', 4),
  ('anthropometry', 'skinfold_sum_mm',        'Sumatoria de pliegues',     'mm',       false, 1,   15,    300,    false, 'last', null,             null,               'performance_data', 5),
  ('anthropometry', 'maturity_offset',        'Offset de PHV (Mirwald)',   'años',     true,  2,   null,  null,   false, 'last', null,             'mirwald_offset',   'performance_data', 6),

  ('back_squat',    'back_squat_load_kg',     'Sentadilla · carga',        'kg',       true,  1,   0,     350,    false, 'max',  'load',           null,               'performance_data', 1),
  ('back_squat',    'back_squat_reps',        'Sentadilla · reps',         'reps',     true,  0,   1,     12,     false, 'max',  'reps',           null,               'performance_data', 2),
  ('back_squat',    'back_squat_1rm_kg',      'Sentadilla · 1RM',          'kg',       true,  1,   null,  null,   true,  'max',  null,             'epley_1rm',        'performance_data', 3),

  ('bench_press',   'bench_press_load_kg',    'Press banca · carga',       'kg',       true,  1,   0,     250,    false, 'max',  'load',           null,               'performance_data', 1),
  ('bench_press',   'bench_press_reps',       'Press banca · reps',        'reps',     true,  0,   1,     12,     false, 'max',  'reps',           null,               'performance_data', 2),
  ('bench_press',   'bench_press_1rm_kg',     'Press banca · 1RM',         'kg',       true,  1,   null,  null,   true,  'max',  null,             'epley_1rm',        'performance_data', 3),

  ('deadlift',      'deadlift_load_kg',       'Peso muerto · carga',       'kg',       true,  1,   0,     400,    false, 'max',  'load',           null,               'performance_data', 1),
  ('deadlift',      'deadlift_reps',          'Peso muerto · reps',        'reps',     true,  0,   1,     12,     false, 'max',  'reps',           null,               'performance_data', 2),
  ('deadlift',      'deadlift_1rm_kg',        'Peso muerto · 1RM',         'kg',       true,  1,   null,  null,   true,  'max',  null,             'epley_1rm',        'performance_data', 3),

  ('pull_ups',      'pull_ups_reps',          'Dominadas',                 'reps',     true,  0,   0,     60,     true,  'max',  null,             null,               'performance_data', 1),

  ('grip_strength', 'grip_left_kg',           'Agarre izquierda',          'kg',       true,  1,   5,     100,    false, 'max',  null,             null,               'performance_data', 1),
  ('grip_strength', 'grip_right_kg',          'Agarre derecha',            'kg',       true,  1,   5,     100,    true,  'max',  null,             null,               'performance_data', 2),

  ('sprint_40',     'sprint_10m_s',           'Sprint 10 m',               's',        false, 2,   1.40,  3.50,   true,  'min',  null,             null,               'performance_data', 1),
  ('sprint_40',     'sprint_20m_s',           'Sprint 20 m',               's',        false, 2,   2.40,  5.50,   false, 'min',  null,             null,               'performance_data', 2),
  ('sprint_40',     'sprint_40m_s',           'Sprint 40 m',               's',        false, 2,   4.40,  9.50,   false, 'min',  null,             null,               'performance_data', 3),

  ('cmj',           'cmj_height_cm',          'CMJ altura',                'cm',       true,  1,   5,     85,     true,  'max',  null,             null,               'performance_data', 1),

  ('reaction',      'reaction_time_ms',       'Tiempo de reacción',        'ms',       false, 0,   100,   1000,   true,  'avg',  null,             null,               'performance_data', 1),

  ('agility_505',   'agility_505_left_s',     '505 izquierda',             's',        false, 2,   1.80,  4.00,   true,  'min',  null,             null,               'performance_data', 1),
  ('agility_505',   'agility_505_right_s',    '505 derecha',               's',        false, 2,   1.80,  4.00,   false, 'min',  null,             null,               'performance_data', 2),

  ('t_test',        't_test_s',               'T-Test',                    's',        false, 2,   7.50,  18.00,  true,  'min',  null,             null,               'performance_data', 1),

  ('yoyo_ir1',      'yoyo_ir1_level',         'Yo-Yo IR1 nivel',           'nivel',    true,  1,   5,     24,     false, 'max',  null,             null,               'performance_data', 1),
  ('yoyo_ir1',      'yoyo_ir1_distance_m',    'Yo-Yo IR1 distancia',       'm',        true,  0,   40,    4000,   true,  'max',  'distance',       null,               'performance_data', 2),
  ('yoyo_ir1',      'yoyo_ir1_vo2max',        'VO₂máx estimado',           'ml/kg/min',true,  1,   null,  null,   false, 'max',  null,             'yoyo_ir1_vo2max',  'performance_data', 3),

  ('ift_30_15',     'ift_vift_kmh',           'VIFT',                      'km/h',     true,  1,   8,     26,     true,  'max',  null,             null,               'performance_data', 1),

  ('match_stats',   'minutes_played',         'Minutos jugados',           'min',      true,  0,   0,     100,    true,  'max',  null,             null,               'performance_data', 1),
  ('match_stats',   'tackles_made',           'Placajes efectivos',        'n',        true,  0,   0,     50,     false, 'max',  null,             null,               'performance_data', 2),
  ('match_stats',   'tackles_missed',         'Placajes errados',          'n',        false, 0,   0,     30,     false, 'max',  null,             null,               'performance_data', 3),
  ('match_stats',   'ruck_arrivals',          'Llegadas a ruck',           'n',        true,  0,   0,     80,     false, 'max',  null,             null,               'performance_data', 4),
  ('match_stats',   'carries',                'Portaciones',               'n',        true,  0,   0,     50,     false, 'max',  null,             null,               'performance_data', 5),
  ('match_stats',   'turnovers_won',          'Pelotas recuperadas',       'n',        true,  0,   0,     20,     false, 'max',  null,             null,               'performance_data', 6),

  ('gps_load',      'gps_total_distance_m',   'Distancia total',           'm',        true,  0,   0,     14000,  true,  'max',  null,             null,               'gps_tracking',     1),
  ('gps_load',      'gps_hsr_m',              'Distancia alta velocidad',  'm',        true,  0,   0,     4000,   false, 'max',  null,             null,               'gps_tracking',     2),
  ('gps_load',      'gps_max_speed_kmh',      'Velocidad máxima',          'km/h',     true,  1,   5,     40,     false, 'max',  null,             null,               'gps_tracking',     3),
  ('gps_load',      'gps_sprints',            'Sprints',                   'n',        true,  0,   0,     80,     false, 'max',  null,             null,               'gps_tracking',     4),
  ('gps_load',      'gps_player_load',        'Player load',               'au',       true,  0,   0,     2000,   false, 'max',  null,             null,               'gps_tracking',     5)
) as m (test, code, name, unit, hib, dec, min_v, max_v, prim, best, role, deriv, consent, ord)
join public.test_types tt on tt.code = m.test
on conflict (code) do update
  set name = excluded.name, unit = excluded.unit, higher_is_better = excluded.higher_is_better,
      decimals = excluded.decimals, min_valid = excluded.min_valid, max_valid = excluded.max_valid,
      is_primary = excluded.is_primary, best_of = excluded.best_of, input_role = excluded.input_role,
      derivation = excluded.derivation, required_consent = excluded.required_consent,
      sort_order = excluded.sort_order;
