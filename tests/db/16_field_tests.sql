-- =====================================================================
-- Tests de cancha: cálculo en la base, intentos sólo se agregan,
-- anulación, renumeración, batería por categoría, consentimiento de
-- imagen para video, equipo en la reacción, protocolos inmutables.
-- (Usa los datos de supabase/seed.sql.)
-- =====================================================================
begin;
\o /dev/null
create schema ft_t;
grant usage on schema ft_t to authenticated;
create function ft_t.eq(actual numeric, expected numeric, msg text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then raise exception 'FALLA: % (esperado %, obtenido %)', msg, expected, actual; end if;
end $$;
create function ft_t.is(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FALLA: %', msg; end if;
end $$;
create function ft_t.throws(stmt text, pattern text, msg text) returns void language plpgsql as $$
begin
  begin execute stmt;
  exception when others then
    if sqlerrm !~* pattern then raise exception 'FALLA: % (error inesperado: %)', msg, sqlerrm; end if;
    return;
  end;
  raise exception 'FALLA: % (se esperaba error)', msg;
end $$;
grant execute on all functions in schema ft_t to authenticated;

-- Fórmulas puras (mismos casos que web/src/lib/field-tests/__tests__/parity.test.ts)
select ft_t.eq((select round(value, 4) from private.attempt_metrics('cmj', 'manual', '{"flightMs": 500}', '{"g": 9.81}')), 30.6563, 'CMJ: 500 ms de vuelo = 30,66 cm');
select ft_t.eq((select round(value, 4) from private.attempt_metrics('cmj', 'video', '{"takeoffFrame": 100, "landingFrame": 220, "frameRateFps": 240}', '{"g": 9.81, "min_fps": 120}')), 30.6563, 'CMJ video: 120 cuadros a 240 fps');
select ft_t.eq((select value from private.attempt_metrics('cmj', 'app', '{"heightCm": 41.2}', '{}')), 41.2, 'CMJ: altura directa');
select ft_t.throws($$select * from private.attempt_metrics('cmj', 'video', '{"takeoffFrame": 1, "landingFrame": 30, "frameRateFps": 60}', '{"min_fps": 120}')$$, 'mínimo', 'video bajo 120 fps');
select ft_t.throws($$select * from private.attempt_metrics('cmj', 'video', '{"takeoffFrame": 50, "landingFrame": 40, "frameRateFps": 240}', '{}')$$, 'después', 'aterrizaje antes del despegue');
select ft_t.throws($$select * from private.attempt_metrics('cmj', 'manual', '{"heightCm": 0}', '{}')$$, 'mayor que cero', 'cero no vale');
select ft_t.eq((select round(value, 4) from private.attempt_metrics('sprint_40', 'video', '{"startFrame": 10, "frame10": 430, "frame20": 730, "frame40": 1270, "frameRateFps": 240}', '{"min_fps": 120}') where metric_code = 'sprint_vmax_ms'), 8.8889, 'Vmax = 20/(t40 − t20)');
select ft_t.eq((select round(value, 4) from private.attempt_metrics('sprint_40', 'video', '{"startFrame": 10, "frame10": 430, "frame20": 730, "frame40": 1270, "frameRateFps": 240}', '{"min_fps": 120}') where metric_code = 'sprint_40m_s'), 5.25, 't40');
select ft_t.eq((select count(*) from private.attempt_metrics('sprint_40', 'video', '{"startFrame": 0, "frame20": 720, "frame40": 1260, "frameRateFps": 240}', '{}')), 3, '10 m es opcional');
select ft_t.throws($$select * from private.attempt_metrics('sprint_40', 'video', '{"startFrame": 0, "frame10": 800, "frame20": 720, "frame40": 1260, "frameRateFps": 240}', '{}')$$, 'orden', 'cuadros fuera de orden');
select ft_t.throws($$select * from private.attempt_metrics('sprint_40', 'video', '{"startFrame": 0.5, "frame20": 720, "frame40": 1260, "frameRateFps": 240}', '{}')$$, 'entero', 'cuadro no entero');
select ft_t.eq((select value from private.attempt_metrics('ift_30_15', 'app', '{"lastStage": 17}', '{"start_kmh": 8, "step_kmh": 0.5}')), 16, 'VIFT etapa 17 = 16 km/h');
select ft_t.eq((select count(*) from private.attempt_metrics('ift_30_15', 'app', '{"lastStage": 0}', '{}')), 0, 'sin etapa 1 completa no hay VIFT');
select ft_t.eq((select value from private.attempt_metrics('reaction', 'app',
  '{"mode": "simple", "trials": [{"outcome":"valid","rtMs":500,"practice":true},{"outcome":"valid","rtMs":250},{"outcome":"valid","rtMs":260},{"outcome":"anticipation","rtMs":40},{"outcome":"valid","rtMs":270},{"outcome":"valid","rtMs":281},{"outcome":"valid","rtMs":290}]}',
  '{"valid": 5}')), 270, 'reacción: promedio de los válidos (sin práctica ni anticipaciones)');
select ft_t.throws($$select * from private.attempt_metrics('reaction', 'app', '{"mode":"simple","trials":[{"outcome":"valid","rtMs":250}]}', '{"valid": 5}')$$, 'incompleta', 'serie incompleta');

create temp table ctx as select
  (select id from categories where code = 'M17') m17,
  (select id from categories where code = 'M13') m13,
  (select id from seasons where is_current) season,
  (select psc.player_id from player_season_categories psc join categories c on c.id = psc.category_id
     join consents k on k.player_id = psc.player_id and k.consent_type = 'performance_data' and k.revoked_at is null
   join seasons s on s.id = psc.season_id and s.is_current
   where c.code = 'M17' order by psc.player_id limit 1) pl,
  (select psc.player_id from player_season_categories psc join categories c on c.id = psc.category_id
     join consents k on k.player_id = psc.player_id and k.consent_type = 'performance_data' and k.revoked_at is null
   join seasons s on s.id = psc.season_id and s.is_current
   where c.code = 'M17' order by psc.player_id offset 1 limit 1) pl2,
  (select id from test_types where code = 'cmj') cmj,
  (select id from test_types where code = 'reaction') reac,
  (select id from test_types where code = 'back_squat') squat,
  (select id from test_protocols where active and test_type_id = (select id from test_types where code = 'cmj')) p_cmj,
  (select id from test_protocols where active and test_type_id = (select id from test_types where code = 'reaction')) p_reac,
  (select id from test_protocols where active and test_type_id = (select id from test_types where code = 'back_squat')) p_squat,
  (select id from test_metrics where code = 'cmj_height_cm') m_cmj;
grant select on ctx to authenticated;

-- Consentimiento de imagen para el primer jugador (lo firma su tutor)
insert into consents (player_id, guardian_id, consent_type, document_version)
select player_id, guardian_id, 'image_use', 't' from consents
 where player_id = (select pl from ctx) and consent_type = 'performance_data' limit 1;
-- Protocolo de sentadilla (para probar la batería)
insert into test_protocols (test_type_id, params) values ((select squat from ctx), '{}');
update ctx set p_squat = (select id from test_protocols where active and test_type_id = (select squat from ctx));

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-a000-000000000017', true);

insert into evaluation_sessions (id, season_id, category_id, session_type, session_date, title)
values ('0f000000-0000-4000-8000-000000000001', (select season from ctx), (select m17 from ctx), 'testing', current_date, 'Tests de cancha');

-- Intento manual (tiempo de vuelo) → la base calcula la altura
insert into test_attempts (id, session_id, player_id, test_type_id, protocol_id, attempt, method, inputs)
values ('0f000000-0000-4000-8000-0000000000a1', '0f000000-0000-4000-8000-000000000001', (select pl from ctx),
        (select cmj from ctx), (select p_cmj from ctx), 1, 'manual', '{"flightMs": 500}');
select ft_t.eq((select value from results where attempt_id = '0f000000-0000-4000-8000-0000000000a1'), 30.7, 'altura calculada (1 decimal)');
select ft_t.is((select method = 'manual' and protocol_version = 1 from results where attempt_id = '0f000000-0000-4000-8000-0000000000a1'), 'resultado marcado con método y versión');

-- Reenviar el mismo intento no duplica (ON CONFLICT DO NOTHING)
insert into test_attempts (id, session_id, player_id, test_type_id, protocol_id, attempt, method, inputs)
values ('0f000000-0000-4000-8000-0000000000a1', '0f000000-0000-4000-8000-000000000001', (select pl from ctx),
        (select cmj from ctx), (select p_cmj from ctx), 1, 'manual', '{"flightMs": 500}')
on conflict (id) do nothing;
select ft_t.eq((select count(*) from test_attempts where player_id = (select pl from ctx)), 1, 'reenviar no duplica');

-- Otro celular cargó también el "intento 1": pasa a ser el 2
insert into test_attempts (id, session_id, player_id, test_type_id, protocol_id, attempt, method, inputs)
values ('0f000000-0000-4000-8000-0000000000a2', '0f000000-0000-4000-8000-000000000001', (select pl from ctx),
        (select cmj from ctx), (select p_cmj from ctx), 1, 'app', '{"heightCm": 33.4}');
select ft_t.eq((select attempt from test_attempts where id = '0f000000-0000-4000-8000-0000000000a2'), 2, 'renumera al siguiente');

-- No se editan: ni el intento ni su resultado
update test_attempts set inputs = '{"flightMs": 600}' where id = '0f000000-0000-4000-8000-0000000000a1';
select ft_t.eq((select (inputs ->> 'flightMs')::int from test_attempts where id = '0f000000-0000-4000-8000-0000000000a1'), 500, 'el intento no se edita (sin política de update)');
select ft_t.throws($$update results set value = 50 where attempt_id = '0f000000-0000-4000-8000-0000000000a1'$$, 'anulá', 'el resultado de un intento no se edita');
select ft_t.throws($$insert into results (session_id, player_id, metric_id, attempt, value, attempt_id)
  values ('0f000000-0000-4000-8000-000000000001', (select pl from ctx), (select m_cmj from ctx), 9, 40, '0f000000-0000-4000-8000-0000000000a1')$$,
  'calcula la base', 'no se puede falsificar un resultado de intento');

-- Anular con motivo: el resultado sale de los cálculos; el intento queda
select ft_t.throws($$insert into test_attempt_voids (id, attempt_id, reason) values (gen_random_uuid(), '0f000000-0000-4000-8000-0000000000a1', ' ')$$, 'check', 'anular exige motivo');
insert into test_attempt_voids (id, attempt_id, reason) values ('0f000000-0000-4000-8000-0000000000b1', '0f000000-0000-4000-8000-0000000000a1', 'Dobló las rodillas al caer');
select ft_t.eq((select count(*) from results where attempt_id = '0f000000-0000-4000-8000-0000000000a1' and deleted_at is null), 0, 'anulado: sale del cálculo');
select ft_t.eq((select count(*) from test_attempts where id = '0f000000-0000-4000-8000-0000000000a1'), 1, 'anulado: el intento queda');
select ft_t.eq((select value from v_session_best where session_id = '0f000000-0000-4000-8000-000000000001' and metric_id = (select m_cmj from ctx)), 33.4, 'mejor de los vigentes');
-- Nuevo intento después de anular: sigue al más alto (los anulados cuentan)
insert into test_attempts (id, session_id, player_id, test_type_id, protocol_id, attempt, method, inputs)
values ('0f000000-0000-4000-8000-0000000000a3', '0f000000-0000-4000-8000-000000000001', (select pl from ctx),
        (select cmj from ctx), (select p_cmj from ctx), 1, 'manual', '{"heightCm": 35}');
select ft_t.eq((select attempt from test_attempts where id = '0f000000-0000-4000-8000-0000000000a3'), 3, 'sigue al más alto (anulados incluidos)');
select ft_t.is((select methods = 'app,manual' from v_session_best where session_id = '0f000000-0000-4000-8000-000000000001' and metric_id = (select m_cmj from ctx)), 'la vista avisa que se mezclan métodos');

-- Video: exige consentimiento de imagen
insert into test_attempts (id, session_id, player_id, test_type_id, protocol_id, attempt, method, inputs)
values ('0f000000-0000-4000-8000-0000000000a4', '0f000000-0000-4000-8000-000000000001', (select pl from ctx),
        (select cmj from ctx), (select p_cmj from ctx), 4, 'video', '{"takeoffFrame": 100, "landingFrame": 230, "frameRateFps": 240}');
select ft_t.eq((select value from results where attempt_id = '0f000000-0000-4000-8000-0000000000a4'), 36.0, 'CMJ por video');
select ft_t.throws($$insert into test_attempts (id, session_id, player_id, test_type_id, protocol_id, attempt, method, inputs)
  values (gen_random_uuid(), '0f000000-0000-4000-8000-000000000001', (select pl2 from ctx), (select cmj from ctx), (select p_cmj from ctx), 1, 'video',
  '{"takeoffFrame": 100, "landingFrame": 230, "frameRateFps": 240}')$$, 'image_use', 'sin consentimiento de imagen no se filma');
-- Datos inválidos: rechaza con mensaje
select ft_t.throws($$insert into test_attempts (id, session_id, player_id, test_type_id, protocol_id, attempt, method, inputs)
  values (gen_random_uuid(), '0f000000-0000-4000-8000-000000000001', (select pl2 from ctx), (select cmj from ctx), (select p_cmj from ctx), 1, 'manual', '{}')$$, 'heightCm', 'sin datos');
-- Fuera del rango duro (error de tipeo) → rechaza
select ft_t.throws($$insert into test_attempts (id, session_id, player_id, test_type_id, protocol_id, attempt, method, inputs)
  values (gen_random_uuid(), '0f000000-0000-4000-8000-000000000001', (select pl2 from ctx), (select cmj from ctx), (select p_cmj from ctx), 1, 'manual', '{"heightCm": 300}')$$, 'fuera de rango', 'rango duro');

-- Reacción: exige equipo
select ft_t.throws($$insert into test_attempts (id, session_id, player_id, test_type_id, protocol_id, attempt, method, inputs)
  values (gen_random_uuid(), '0f000000-0000-4000-8000-000000000001', (select pl2 from ctx), (select reac from ctx), (select p_reac from ctx), 1, 'app', '{"mode":"simple","meanMs":280}')$$, 'equipo', 'reacción sin equipo');
insert into test_devices (id, label) values ('0f000000-0000-4000-8000-0000000000d1', 'Samsung del profe');
insert into test_attempts (id, session_id, player_id, test_type_id, protocol_id, attempt, method, inputs, device_id)
values ('0f000000-0000-4000-8000-0000000000a5', '0f000000-0000-4000-8000-000000000001', (select pl2 from ctx),
        (select reac from ctx), (select p_reac from ctx), 1, 'app', '{"mode":"simple","meanMs":280}', '0f000000-0000-4000-8000-0000000000d1');
select ft_t.is((select device_id = '0f000000-0000-4000-8000-0000000000d1' from results where attempt_id = '0f000000-0000-4000-8000-0000000000a5'), 'el resultado guarda el equipo');
select ft_t.is((select individual_only from test_metrics where code = 'reaction_time_ms'), 'reacción: sólo comparación individual');
select ft_t.eq((select count(*) from public.category_benchmarks((select season from ctx), (select id from test_metrics where code = 'reaction_time_ms'), null)), 0, 'sin benchmarks de reacción entre jugadores');

-- Vmax derivada: desde la grilla (t20/t40 a mano) también se calcula
insert into results (session_id, player_id, metric_id, attempt, value) values
  ('0f000000-0000-4000-8000-000000000001', (select pl2 from ctx), (select id from test_metrics where code = 'sprint_20m_s'), 1, 3.10),
  ('0f000000-0000-4000-8000-000000000001', (select pl2 from ctx), (select id from test_metrics where code = 'sprint_40m_s'), 1, 5.40);
select ft_t.eq((select value from results where session_id = '0f000000-0000-4000-8000-000000000001' and player_id = (select pl2 from ctx) and metric_id = (select id from test_metrics where code = 'sprint_vmax_ms') and deleted_at is null), 8.70, 'Vmax derivada de la grilla');

-- Protocolos: sólo el admin crea versiones; los parámetros no se editan
select ft_t.throws($$insert into test_protocols (test_type_id, params) values ((select cmj from ctx), '{"g": 9.8}')$$, 'row-level', 'el profe no crea versiones');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-a000-000000000001', true);
select ft_t.throws($$update test_protocols set params = '{"g": 9.8}' where id = (select p_cmj from ctx)$$, 'versión nueva', 'parámetros inmutables');
insert into test_protocols (test_type_id, params) values ((select cmj from ctx), '{"g": 9.8, "min_fps": 120}');
select ft_t.eq((select version from test_protocols where active and test_type_id = (select cmj from ctx)), 2, 'versión nueva = 2 y queda activa');
select ft_t.eq((select count(*) from test_protocols where active and test_type_id = (select cmj from ctx)), 1, 'una sola activa');
select ft_t.eq((select value from results where attempt_id = '0f000000-0000-4000-8000-0000000000a4'), 36.0, 'los resultados viejos no cambian');

-- Batería: M13 no hace tests máximos con carga
insert into evaluation_sessions (id, season_id, category_id, session_type, session_date)
values ('0f000000-0000-4000-8000-000000000002', (select season from ctx), (select m13 from ctx), 'testing', current_date);
select ft_t.throws($$insert into test_attempts (id, session_id, player_id, test_type_id, protocol_id, attempt, method, inputs)
  values (gen_random_uuid(), '0f000000-0000-4000-8000-000000000002', (select pl from ctx), (select squat from ctx), (select p_squat from ctx), 1, 'manual', '{}')$$,
  'no corresponde', 'test fuera de la batería de la categoría');

-- CMJ semanal: ajuste sembrado con M17
select ft_t.is((select value -> 'category_codes' ? 'M17' from club_settings where key = 'cmj_weekly'), 'CMJ semanal: M17 por defecto');
reset role;

-- Médico: ve intentos sólo si tiene el módulo; el profe de M15 no ve los de M17
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-a000-000000000015', true);
select ft_t.eq((select count(*) from test_attempts where session_id = '0f000000-0000-4000-8000-000000000001'), 0, 'profe de otra categoría no ve');
select ft_t.throws($$insert into test_attempt_voids (id, attempt_id, reason) values (gen_random_uuid(), '0f000000-0000-4000-8000-0000000000a3', 'no corresponde')$$, '.', 'profe de otra categoría no anula');
reset role;
\o
do $$ begin raise notice '16_field_tests: OK'; end $$;
rollback;
