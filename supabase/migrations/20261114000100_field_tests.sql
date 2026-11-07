-- =====================================================================
-- Tests de cancha: CMJ, sprint 10/20/40, 30-15 IFT y reacción tomados
-- con el celular del profe.
--
--   test_protocols          versión del protocolo con sus parámetros (inmutable)
--   test_devices            cada celular como "equipo" (reacción: sólo se
--                           compara dentro del mismo equipo)
--   test_attempts           intento crudo: lo que se midió (inputs), cómo
--                           (método, protocolo, equipo) y quién. Sólo se agregan.
--   test_attempt_voids      anulación de un intento (con motivo). Corregir =
--                           anular + cargar otro.
--   category_test_exclusions  tests que NO corresponden a una categoría
--   test_metric_ranges      rangos esperables por sexo (avisan, no bloquean)
--
-- La base calcula las métricas de cada intento (private.attempt_metrics)
-- y las escribe en results, marcadas con el intento, el método, la versión
-- del protocolo y el equipo. Así gráficos, alertas y pase siguen igual.
-- Las mismas fórmulas están en web/src/lib/field-tests (vista en vivo) y
-- un test verifica que den lo mismo.
-- =====================================================================

create type public.measure_method as enum ('manual', 'video', 'app', 'fotocelula', 'historico');

-- ---------------------------------------------------------------------
-- Métricas nuevas y marcas en results
-- ---------------------------------------------------------------------
alter table public.test_metrics
  add column individual_only boolean not null default false;  -- no se compara entre jugadores
comment on column public.test_metrics.individual_only is
  'Sólo se compara al mismo jugador con el mismo equipo (ej. reacción: la latencia táctil cambia entre celulares).';

insert into public.test_metrics (
  test_type_id, code, name, unit, higher_is_better, decimals, min_valid, max_valid,
  is_primary, best_of, required_consent, sort_order, individual_only)
select tt.id, m.code, m.name, m.unit, m.hib, m.dec, m.min_v, m.max_v, false, m.best::public.best_of_rule,
       'performance_data', m.ord, m.ind
from (values
  ('sprint_40', 'sprint_vmax_ms',     'Velocidad máxima (20–40 m)', 'm/s', true,  2, 3.0, 12.5, 'max', 4, false),
  ('reaction',  'reaction_gonogo_ms', 'Reacción go/no-go',          'ms',  false, 0, 100, 1500, 'avg', 2, true)
) as m (test, code, name, unit, hib, dec, min_v, max_v, best, ord, ind)
join public.test_types tt on tt.code = m.test
on conflict (code) do nothing;

update public.test_metrics set individual_only = true where code in ('reaction_time_ms', 'reaction_gonogo_ms');

-- Vmax: derivada de los parciales de 20 y 40 m (la calcula la base también
-- cuando se cargan a mano en la grilla de Evaluaciones).
update public.test_metrics set input_role = 't20' where code = 'sprint_20m_s';
update public.test_metrics set input_role = 't40' where code = 'sprint_40m_s';
update public.test_metrics set derivation = 'sprint_vmax', min_valid = null, max_valid = null where code = 'sprint_vmax_ms';

create or replace function private.recompute_derived(
  p_session_id uuid, p_player_id uuid, p_attempt smallint, p_test_type_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m          record;
  v          numeric;
  v_load     numeric;
  v_reps     numeric;
  v_dist     numeric;
  v_ht       numeric;
  v_sh       numeric;
  v_wt       numeric;
  v_ll       numeric;
  v_age      numeric;
  v_sex      public.sex;
begin
  perform set_config('orc.deriving', 'on', true);

  for m in
    select * from public.test_metrics
    where test_type_id = p_test_type_id and derivation is not null and active
  loop
    v := null;

    case m.derivation
      when 'epley_1rm' then
        v_load := private.result_input(p_session_id, p_player_id, p_attempt, p_test_type_id, 'load');
        v_reps := private.result_input(p_session_id, p_player_id, p_attempt, p_test_type_id, 'reps');
        -- Epley es razonable hasta ~10-12 reps
        if v_load is not null and v_reps between 1 and 12 then
          v := case when v_reps = 1 then v_load else v_load * (1 + v_reps / 30.0) end;
        end if;

      when 'yoyo_ir1_vo2max' then
        -- Bangsbo et al. (2008): VO2max = distancia(m) × 0.0084 + 36.4
        v_dist := private.result_input(p_session_id, p_player_id, p_attempt, p_test_type_id, 'distance');
        if v_dist is not null then
          v := v_dist * 0.0084 + 36.4;
        end if;

      when 'mirwald_offset' then
        -- Mirwald et al. (2002): maturity offset (años desde el PHV)
        v_ht := private.result_input(p_session_id, p_player_id, p_attempt, p_test_type_id, 'height');
        v_sh := private.result_input(p_session_id, p_player_id, p_attempt, p_test_type_id, 'sitting_height');
        v_wt := private.result_input(p_session_id, p_player_id, p_attempt, p_test_type_id, 'weight');
        select private.age_on(p.birth_date, s.session_date), p.sex
          into v_age, v_sex
          from public.players p, public.evaluation_sessions s
         where p.id = p_player_id and s.id = p_session_id;
        if v_ht is not null and v_sh is not null and v_wt is not null and v_sh < v_ht
           and v_age between 8 and 19 then
          v_ll := v_ht - v_sh;
          if v_sex = 'male' then
            v := -9.236 + 0.0002708 * (v_ll * v_sh) - 0.001663 * (v_age * v_ll)
                 + 0.007216 * (v_age * v_sh) + 0.02292 * (v_wt / v_ht * 100);
          else
            v := -9.376 + 0.0001882 * (v_ll * v_sh) + 0.0022 * (v_age * v_ll)
                 + 0.005841 * (v_age * v_sh) - 0.002658 * (v_age * v_wt)
                 + 0.07693 * (v_wt / v_ht * 100);
          end if;
        end if;
      when 'sprint_vmax' then
        -- Vmax del tramo 20–40 m = 20 / (t40 − t20)
        v_ht := private.result_input(p_session_id, p_player_id, p_attempt, p_test_type_id, 't20');
        v_wt := private.result_input(p_session_id, p_player_id, p_attempt, p_test_type_id, 't40');
        if v_ht is not null and v_wt is not null and v_wt > v_ht then
          v := 20 / (v_wt - v_ht);
        end if;
    end case;

    if v is null then
      update public.results
         set deleted_at = now()
       where session_id = p_session_id and player_id = p_player_id
         and metric_id = m.id and attempt = p_attempt and deleted_at is null;
    else
      v := round(v, m.decimals);
      -- La derivada hereda cómo se midieron sus insumos (método, protocolo, equipo, intento).
      insert into public.results (session_id, player_id, metric_id, attempt, value, recorded_by,
                                  method, protocol_version, device_id, attempt_id)
      select p_session_id, p_player_id, m.id, p_attempt, v, auth.uid(),
             coalesce(src.method, 'manual'), src.protocol_version, src.device_id, src.attempt_id
      from (select 1) one
      left join lateral (
        select r.method, r.protocol_version, r.device_id, r.attempt_id
        from public.results r join public.test_metrics im on im.id = r.metric_id
        where r.session_id = p_session_id and r.player_id = p_player_id and r.attempt = p_attempt
          and im.test_type_id = p_test_type_id and im.input_role is not null and r.deleted_at is null
        limit 1) src on true
      on conflict (session_id, player_id, metric_id, attempt) where deleted_at is null
      do update set value = excluded.value;
    end if;
  end loop;

  perform set_config('orc.deriving', 'off', true);
end
$$;

alter table public.results
  add column method           public.measure_method not null default 'manual',
  add column protocol_version smallint,
  add column device_id        uuid,
  add column attempt_id       uuid;
comment on column public.results.attempt_id is 'Intento de cancha del que sale el valor (sólo lo escribe la base).';

-- Con anulaciones el número de intento sigue al más alto conocido.
alter table public.results drop constraint results_attempt_check;
alter table public.results add constraint results_attempt_check check (attempt between 1 and 50);

-- Vmax para los sprints ya cargados (t20 y t40 en el mismo intento)
do $$
declare x record;
begin
  for x in
    select distinct r.session_id, r.player_id, r.attempt, m.test_type_id
    from public.results r join public.test_metrics m on m.id = r.metric_id
    where m.code = 'sprint_40m_s' and r.deleted_at is null
  loop
    begin
      perform private.recompute_derived(x.session_id, x.player_id, x.attempt, x.test_type_id);
    exception when others then null;  -- p. ej. consentimiento revocado: se deja como está
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Protocolos versionados
-- ---------------------------------------------------------------------
create table public.test_protocols (
  id            uuid primary key default gen_random_uuid(),
  test_type_id  uuid not null references public.test_types (id) on delete restrict,
  version       smallint not null check (version >= 1),
  params        jsonb not null default '{}'::jsonb,
  notes         text,
  active        boolean not null default true,
  created_by    uuid references public.profiles (id) default auth.uid(),
  created_at    timestamptz not null default now(),
  unique (test_type_id, version)
);
create unique index test_protocols_active_idx on public.test_protocols (test_type_id) where active;

-- Los parámetros de una versión no cambian nunca: cambiar = versión nueva.
create or replace function private.test_protocols_before()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.params is distinct from old.params
      or new.version <> old.version or new.test_type_id <> old.test_type_id) then
    raise exception 'Los parámetros de un protocolo no se editan: creá una versión nueva'
      using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    -- Versión nueva = la siguiente; desactiva la anterior.
    select coalesce(max(version), 0) + 1 into new.version
      from public.test_protocols where test_type_id = new.test_type_id;
    update public.test_protocols set active = false
     where test_type_id = new.test_type_id and active and new.active;
  end if;
  return new;
end $$;
create trigger test_protocols_before before insert or update on public.test_protocols
  for each row execute function private.test_protocols_before();

insert into public.test_protocols (test_type_id, params, notes)
select tt.id, p.params::jsonb, p.notes
from (values
  ('cmj', '{
     "g": 9.81, "attempts": 3, "min_fps": 120, "preferred_fps": 240, "max_record_s": 8,
     "weekly": {"baseline_days": 42, "min_days": 3, "warn_drop_pct": 7, "crit_drop_pct": 12}
   }', 'Manos en la cintura, 3 intentos, vale el mejor. h = g·t²/8.'),
  ('sprint_40', '{
     "attempts": 3, "rest_min": 3, "start_behind_m": 0.5, "min_fps": 120, "preferred_fps": 240,
     "camera_fov_deg": 60, "suggested_distance_m": 35, "max_line_angle_deg": 55, "cone_offset_m": 2
   }', 'Salida parado 0,5 m detrás de la línea. Cero = cruce del tronco en 0 m. Vmax = 20/(t40 − t20).'),
  ('ift_30_15', '{
     "start_kmh": 8, "step_kmh": 0.5, "run_s": 30, "rest_s": 15, "shuttle_m": 40, "line_every_m": 20,
     "tolerance_m": 3, "max_stage": 40, "lead_in_s": 10, "countdown_beeps": 3, "max_misses": 3,
     "rest_grace_s": 2, "late_skip_ms": 250
   }', 'Buchheit 2008. VIFT = 8 + (última etapa completa − 1)·0,5 km/h.'),
  ('reaction', '{
     "valid": 5, "practice": 3, "wait_min_ms": 1000, "wait_max_ms": 3000, "anticipation_ms": 100,
     "window_ms": 1000, "nogo_pct": 30, "nogo_max_run": 2, "max_scored": 20
   }', 'Promedio de los estímulos válidos. Sólo se compara al mismo jugador con el mismo celular.')
) as p (code, params, notes)
join public.test_types tt on tt.code = p.code;

-- ---------------------------------------------------------------------
-- Equipos (celulares)
-- ---------------------------------------------------------------------
create table public.test_devices (
  id          uuid primary key,                 -- lo genera el celular
  label       text check (char_length(label) <= 80),
  platform    text check (char_length(platform) <= 200),
  created_by  uuid references public.profiles (id) default auth.uid(),
  created_at  timestamptz not null default now(),
  retired_at  timestamptz                       -- nunca se borran, se retiran
);

-- ---------------------------------------------------------------------
-- Batería por categoría (lo que NO corresponde, con su motivo)
-- ---------------------------------------------------------------------
create table public.category_test_exclusions (
  category_id   uuid not null references public.categories (id) on delete cascade,
  test_type_id  uuid not null references public.test_types (id) on delete cascade,
  reason        text not null check (char_length(reason) between 3 and 200),
  primary key (category_id, test_type_id)
);

insert into public.category_test_exclusions (category_id, test_type_id, reason)
select c.id, t.id, 'Hasta M14 no se hacen tests máximos con carga'
from public.categories c
cross join public.test_types t
where t.code in ('back_squat', 'bench_press', 'deadlift')
  and c.max_age is not null and c.max_age <= 14
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Rangos esperables por sexo (avisan con "Guardar igual")
-- ---------------------------------------------------------------------
create table public.test_metric_ranges (
  metric_id  uuid not null references public.test_metrics (id) on delete cascade,
  sex        public.sex not null,
  warn_min   numeric,
  warn_max   numeric,
  primary key (metric_id, sex),
  check (warn_min is null or warn_max is null or warn_min < warn_max)
);

insert into public.test_metric_ranges (metric_id, sex, warn_min, warn_max)
select m.id, r.sex::public.sex, r.lo, r.hi
from (values
  ('cmj_height_cm',      'male',   15,   70),  ('cmj_height_cm',      'female', 10,   55),
  ('sprint_10m_s',       'male',   1.55, 2.60), ('sprint_10m_s',       'female', 1.70, 2.90),
  ('sprint_20m_s',       'male',   2.70, 4.20), ('sprint_20m_s',       'female', 3.00, 4.60),
  ('sprint_40m_s',       'male',   4.80, 7.20), ('sprint_40m_s',       'female', 5.40, 8.00),
  ('sprint_vmax_ms',     'male',   6.0,  10.5), ('sprint_vmax_ms',     'female', 5.0,  9.0),
  ('ift_vift_kmh',       'male',   14,   23),   ('ift_vift_kmh',       'female', 12,   20),
  ('reaction_time_ms',   'male',   150,  450),  ('reaction_time_ms',   'female', 150,  450),
  ('reaction_gonogo_ms', 'male',   200,  650),  ('reaction_gonogo_ms', 'female', 200,  650)
) as r (code, sex, lo, hi)
join public.test_metrics m on m.code = r.code
on conflict do nothing;

-- CMJ semanal: categorías donde se usa (por defecto M17 y M19).
-- Se guardan los códigos (estables entre temporadas y entornos).
insert into public.club_settings (key, value)
values ('cmj_weekly', '{"category_codes": ["M17", "M19"]}')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- Cálculo: entradas crudas → métricas (fuente única en la base)
-- ---------------------------------------------------------------------
create or replace function private.invalid_input(p_msg text)
returns void language plpgsql set search_path = '' as $$
begin
  raise exception '%', p_msg using errcode = '23514', hint = 'invalid_inputs';
end $$;

create or replace function private.frame(p_inputs jsonb, p_key text, p_required boolean default true)
returns numeric language plpgsql immutable set search_path = '' as $$
declare v numeric;
begin
  if p_inputs ->> p_key is null then
    if p_required then perform private.invalid_input(format('Falta el cuadro "%s"', p_key)); end if;
    return null;
  end if;
  v := (p_inputs ->> p_key)::numeric;
  if v < 0 or v <> trunc(v) then
    perform private.invalid_input(format('El cuadro "%s" tiene que ser un entero ≥ 0', p_key));
  end if;
  return v;
end $$;

create or replace function private.positive(p_inputs jsonb, p_key text, p_required boolean default true)
returns numeric language plpgsql immutable set search_path = '' as $$
declare v numeric;
begin
  if p_inputs ->> p_key is null then
    if p_required then perform private.invalid_input(format('Falta "%s"', p_key)); end if;
    return null;
  end if;
  v := (p_inputs ->> p_key)::numeric;
  if v <= 0 then perform private.invalid_input(format('"%s" tiene que ser mayor que cero', p_key)); end if;
  return v;
end $$;

create or replace function private.attempt_metrics(
  p_test text, p_method public.measure_method, p_inputs jsonb, p_params jsonb
)
returns table (metric_code text, value numeric)
language plpgsql
immutable
set search_path = ''
as $$
declare
  g      numeric := coalesce((p_params ->> 'g')::numeric, 9.81);
  fps    numeric;
  f0     numeric; f10 numeric; f20 numeric; f40 numeric; fa numeric; fb numeric;
  t      numeric; t10 numeric; t20 numeric; t40 numeric;
  stage  int;
  n      int;
  mode   text;
begin
  if p_inputs is null or jsonb_typeof(p_inputs) <> 'object' then
    perform private.invalid_input('Faltan los datos medidos');
  end if;

  if p_method = 'video' then
    fps := private.positive(p_inputs, 'frameRateFps');
    if fps < coalesce((p_params ->> 'min_fps')::numeric, 120) then
      perform private.invalid_input(format('El video tiene %s fps: el mínimo es %s', round(fps), p_params ->> 'min_fps'));
    end if;
  end if;

  case p_test
  -- CMJ ---------------------------------------------------------------
  when 'cmj' then
    if p_method = 'video' then
      fa := private.frame(p_inputs, 'takeoffFrame');
      fb := private.frame(p_inputs, 'landingFrame');
      if fb <= fa then perform private.invalid_input('El aterrizaje tiene que ser después del despegue'); end if;
      t := (fb - fa) / fps;
    elsif p_inputs ? 'flightMs' then
      t := private.positive(p_inputs, 'flightMs') / 1000;
    else
      metric_code := 'cmj_height_cm';
      value := private.positive(p_inputs, 'heightCm');
      return next;
      return;
    end if;
    metric_code := 'cmj_height_cm';
    value := g * t * t / 8 * 100;
    return next;

  -- Sprint 10/20/40 ---------------------------------------------------
  when 'sprint_40' then
    if p_method = 'video' then
      f0  := private.frame(p_inputs, 'startFrame');
      f10 := private.frame(p_inputs, 'frame10', false);
      f20 := private.frame(p_inputs, 'frame20');
      f40 := private.frame(p_inputs, 'frame40');
      if (f10 is not null and (f10 <= f0 or f20 <= f10)) or f20 <= f0 or f40 <= f20 then
        perform private.invalid_input('Los cuadros tienen que ir en orden: salida < 10 m < 20 m < 40 m');
      end if;
      t10 := (f10 - f0) / fps;
      t20 := (f20 - f0) / fps;
      t40 := (f40 - f0) / fps;
    else
      t10 := private.positive(p_inputs, 't10', false);
      t20 := private.positive(p_inputs, 't20');
      t40 := private.positive(p_inputs, 't40');
      if (t10 is not null and t20 <= t10) or t40 <= t20 then
        perform private.invalid_input('Los tiempos tienen que crecer: 10 m < 20 m < 40 m');
      end if;
    end if;
    if t10 is not null then metric_code := 'sprint_10m_s'; value := t10; return next; end if;
    metric_code := 'sprint_20m_s'; value := t20; return next;
    metric_code := 'sprint_40m_s'; value := t40; return next;
    metric_code := 'sprint_vmax_ms'; value := 20 / (t40 - t20); return next;

  -- 30-15 IFT ---------------------------------------------------------
  when 'ift_30_15' then
    if p_inputs ->> 'lastStage' is null then perform private.invalid_input('Falta la última etapa completa'); end if;
    stage := (p_inputs ->> 'lastStage')::int;
    if stage < 0 or stage > coalesce((p_params ->> 'max_stage')::int, 40) then
      perform private.invalid_input('Etapa fuera del protocolo');
    end if;
    if stage >= 1 then   -- sin la etapa 1 completa no hay VIFT
      metric_code := 'ift_vift_kmh';
      value := coalesce((p_params ->> 'start_kmh')::numeric, 8) + (stage - 1) * coalesce((p_params ->> 'step_kmh')::numeric, 0.5);
      return next;
    end if;

  -- Reacción ----------------------------------------------------------
  when 'reaction' then
    mode := coalesce(p_inputs ->> 'mode', 'simple');
    if mode not in ('simple', 'gonogo') then perform private.invalid_input('Modo de reacción desconocido'); end if;
    metric_code := case mode when 'gonogo' then 'reaction_gonogo_ms' else 'reaction_time_ms' end;
    if p_inputs ? 'meanMs' then
      value := private.positive(p_inputs, 'meanMs');
      return next;
      return;
    end if;
    if jsonb_typeof(p_inputs -> 'trials') <> 'array' then perform private.invalid_input('Faltan los estímulos'); end if;
    select count(*), round(avg((x ->> 'rtMs')::numeric))
      into n, value
      from jsonb_array_elements(p_inputs -> 'trials') x
     where x ->> 'outcome' = 'valid' and coalesce((x ->> 'practice')::boolean, false) = false;
    if n < coalesce((p_params ->> 'valid')::int, 5) then
      perform private.invalid_input(format('Serie incompleta: %s de %s estímulos válidos', n, p_params ->> 'valid'));
    end if;
    return next;

  else
    perform private.invalid_input(format('El test "%s" no se carga por intentos', p_test));
  end case;
end
$$;

-- ---------------------------------------------------------------------
-- Intentos (sólo se agregan)
-- ---------------------------------------------------------------------
create table public.test_attempts (
  id            uuid primary key,                -- lo genera el celular (reenviar no duplica)
  session_id    uuid not null references public.evaluation_sessions (id) on delete cascade,
  player_id     uuid not null references public.players (id) on delete cascade,
  test_type_id  uuid not null references public.test_types (id) on delete restrict,
  protocol_id   uuid not null references public.test_protocols (id) on delete restrict,
  attempt       smallint not null check (attempt between 1 and 50),
  method        public.measure_method not null,
  inputs        jsonb not null,
  conditions    text check (char_length(conditions) <= 300),
  device_id     uuid references public.test_devices (id) on delete restrict,
  notes         text check (char_length(notes) <= 1000),
  category_id   uuid references public.categories (id),   -- snapshot
  recorded_by   uuid references public.profiles (id) default auth.uid(),
  recorded_at   timestamptz not null default now(),         -- hora del celular
  synced_at     timestamptz not null default now()
);
create unique index test_attempts_number_idx on public.test_attempts (session_id, player_id, test_type_id, attempt);
create index test_attempts_player_idx on public.test_attempts (player_id, test_type_id, recorded_at desc);

alter table public.results
  add constraint results_attempt_fk foreign key (attempt_id) references public.test_attempts (id) on delete cascade,
  add constraint results_device_fk foreign key (device_id) references public.test_devices (id) on delete restrict;
create index results_attempt_idx on public.results (attempt_id) where attempt_id is not null;

create table public.test_attempt_voids (
  id          uuid primary key,                  -- lo genera el celular
  attempt_id  uuid not null unique references public.test_attempts (id) on delete cascade,
  reason      text not null check (char_length(btrim(reason)) between 3 and 300),
  voided_by   uuid references public.profiles (id) default auth.uid(),
  voided_at   timestamptz not null default now()
);

create or replace function private.test_attempts_before()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_session  public.evaluation_sessions%rowtype;
  v_proto    public.test_protocols%rowtype;
  v_code     text;
  v_name     text;
  v_reason   text;
  v_taken    boolean;
begin
  select * into v_session from public.evaluation_sessions where id = new.session_id;
  if v_session.id is null or v_session.deleted_at is not null then
    raise exception 'La sesión no existe o fue eliminada' using errcode = '23503';
  end if;
  select code, name into v_code, v_name from public.test_types where id = new.test_type_id;

  select reason into v_reason from public.category_test_exclusions
   where category_id = v_session.category_id and test_type_id = new.test_type_id;
  if v_reason is not null then
    raise exception 'El test "%" no corresponde a esta categoría: %', v_name, v_reason
      using errcode = '23514', hint = 'not_in_battery';
  end if;

  select * into v_proto from public.test_protocols where id = new.protocol_id;
  if v_proto.test_type_id is distinct from new.test_type_id then
    raise exception 'El protocolo no es de este test' using errcode = '23514';
  end if;

  perform private.assert_consent(new.player_id, 'performance_data');
  -- Filmar a un jugador exige consentimiento de imagen (aunque el video no salga del celular).
  if new.method = 'video' then
    perform private.assert_consent(new.player_id, 'image_use');
  end if;
  if v_code = 'reaction' and new.device_id is null then
    raise exception 'La reacción se guarda con el equipo (celular) en el que se midió' using errcode = '23514';
  end if;

  -- Número de intento: si otro celular ya usó ese número, sigue al más alto conocido.
  select exists (select 1 from public.test_attempts a
                  where a.session_id = new.session_id and a.player_id = new.player_id
                    and a.test_type_id = new.test_type_id and a.attempt = new.attempt)
      or exists (select 1 from public.results r join public.test_metrics m on m.id = r.metric_id
                  where r.session_id = new.session_id and r.player_id = new.player_id
                    and m.test_type_id = new.test_type_id and r.attempt = new.attempt and r.deleted_at is null)
    into v_taken;
  if v_taken then
    select greatest(
             coalesce((select max(a.attempt) from public.test_attempts a
                        where a.session_id = new.session_id and a.player_id = new.player_id
                          and a.test_type_id = new.test_type_id), 0),
             coalesce((select max(r.attempt) from public.results r join public.test_metrics m on m.id = r.metric_id
                        where r.session_id = new.session_id and r.player_id = new.player_id
                          and m.test_type_id = new.test_type_id), 0)) + 1
      into new.attempt;
  end if;

  new.category_id := v_session.category_id;
  new.recorded_by := coalesce(auth.uid(), new.recorded_by);
  new.synced_at := now();
  return new;
end $$;

create trigger test_attempts_before before insert on public.test_attempts
  for each row execute function private.test_attempts_before();

-- AFTER: escribe las métricas calculadas en results.
create or replace function private.test_attempts_after()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_code   text;
  v_proto  public.test_protocols%rowtype;
  x        record;
  v_metric public.test_metrics%rowtype;
begin
  select code into v_code from public.test_types where id = new.test_type_id;
  select * into v_proto from public.test_protocols where id = new.protocol_id;
  perform set_config('orc.from_attempt', 'on', true);
  for x in select * from private.attempt_metrics(v_code, new.method, new.inputs, v_proto.params) loop
    select * into v_metric from public.test_metrics where code = x.metric_code;
    -- Las derivadas (ej. Vmax) las calcula recompute_derived a partir de sus insumos.
    continue when v_metric.derivation is not null;
    insert into public.results (
      session_id, player_id, metric_id, attempt, value, recorded_by, recorded_at,
      method, protocol_version, device_id, attempt_id, notes)
    values (
      new.session_id, new.player_id, v_metric.id, new.attempt, round(x.value, v_metric.decimals),
      new.recorded_by, new.recorded_at, new.method, v_proto.version, new.device_id, new.id, new.notes);
  end loop;
  perform set_config('orc.from_attempt', 'off', true);
  return null;
end $$;

create trigger test_attempts_after after insert on public.test_attempts
  for each row execute function private.test_attempts_after();

-- Los intentos no se editan ni se borran (salvo en cascada al borrar la sesión/jugador).
create or replace function private.append_only()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Los intentos no se editan: anulalo con un motivo y cargá otro'
    using errcode = '42501';
end $$;
create trigger test_attempts_no_update before update on public.test_attempts
  for each row execute function private.append_only();
create trigger test_attempt_voids_no_update before update on public.test_attempt_voids
  for each row execute function private.append_only();

create or replace function private.test_attempt_voids_before()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.test_attempts where id = new.attempt_id) then
    raise exception 'El intento no existe' using errcode = '23503';
  end if;
  new.voided_by := coalesce(auth.uid(), new.voided_by);
  new.voided_at := now();
  new.reason := btrim(new.reason);
  return new;
end $$;
create trigger test_attempt_voids_before before insert on public.test_attempt_voids
  for each row execute function private.test_attempt_voids_before();

create or replace function private.test_attempt_voids_after()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('orc.from_attempt', 'on', true);
  update public.results set deleted_at = now()
   where attempt_id = new.attempt_id and deleted_at is null;
  perform set_config('orc.from_attempt', 'off', true);
  return null;
end $$;
create trigger test_attempt_voids_after after insert on public.test_attempt_voids
  for each row execute function private.test_attempt_voids_after();

-- Un resultado que sale de un intento sólo lo escribe la base.
create or replace function private.results_attempt_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('orc.from_attempt', true), 'off') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' and new.attempt_id is not null then
    raise exception 'Los resultados de un intento de cancha los calcula la base' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.attempt_id is not null then
    raise exception 'Este valor sale de un intento medido: anulá el intento y cargá otro' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    new.attempt_id := old.attempt_id;
    new.method := old.method;
    new.protocol_version := old.protocol_version;
    new.device_id := old.device_id;
  end if;
  return new;
end $$;
create trigger results_attempt_guard before insert or update on public.results
  for each row execute function private.results_attempt_guard();

create trigger audit_test_attempts after insert on public.test_attempts
  for each row execute function private.audit_trigger();
create trigger audit_test_attempt_voids after insert on public.test_attempt_voids
  for each row execute function private.audit_trigger();
create trigger audit_test_protocols after insert or update on public.test_protocols
  for each row execute function private.audit_trigger();
create trigger audit_category_test_exclusions after insert or update or delete on public.category_test_exclusions
  for each row execute function private.audit_trigger('category_id');

-- ---------------------------------------------------------------------
-- Vista: mejor intento por sesión + cómo se midió (avisar si se mezcla)
-- ---------------------------------------------------------------------
create or replace view public.v_session_best
with (security_invoker = true)
as
select
  r.session_id,
  s.session_date,
  s.session_type,
  s.season_id,
  r.player_id,
  r.metric_id,
  m.code                        as metric_code,
  m.unit,
  m.higher_is_better,
  t.id                          as test_type_id,
  t.domain,
  (array_agg(r.category_id))[1] as category_id,
  (array_agg(r.position_id))[1] as position_id,
  count(*)::int                 as attempts,
  case m.best_of
    when 'max'  then max(r.value)
    when 'min'  then min(r.value)
    when 'avg'  then round(avg(r.value), m.decimals)
    when 'last' then (array_agg(r.value order by r.attempt desc))[1]
  end                           as value,
  max(r.bodyweight_kg)          as bodyweight_kg,
  string_agg(distinct r.method::text, ',')            as methods,
  string_agg(distinct r.protocol_version::text, ',')  as protocol_versions,
  string_agg(distinct r.device_id::text, ',')         as devices
from public.results r
join public.evaluation_sessions s on s.id = r.session_id and s.deleted_at is null
join public.test_metrics m on m.id = r.metric_id
join public.test_types t on t.id = m.test_type_id
where r.deleted_at is null
group by r.session_id, s.session_date, s.session_type, s.season_id, r.player_id,
         r.metric_id, m.code, m.unit, m.higher_is_better, m.best_of, m.decimals, t.id, t.domain;

-- ---------------------------------------------------------------------
-- Comparaciones entre jugadores: nunca con métricas "individuales"
-- ---------------------------------------------------------------------
create or replace function public.category_benchmarks(
  p_season_id    uuid,
  p_metric_id    uuid,
  p_category_id  uuid default null
)
returns table (
  season_id    uuid,
  category_id  uuid,
  metric_id    uuid,
  group_type   text,
  group_key    text,
  n            integer,
  mean         numeric,
  sd           numeric,
  p25          numeric,
  p50          numeric,
  p75          numeric,
  min_value    numeric,
  max_value    numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with base as (
    select psb.*, pos.unit::text as unit, pos.line::text as line
    from public.v_player_season_best psb
    left join public.positions pos on pos.id = psb.position_id
    where psb.season_id = p_season_id
      and psb.metric_id = p_metric_id
      and (p_category_id is null or psb.category_id = p_category_id)
      -- Sólo usuarios activos con rol de staff pueden consultar benchmarks.
      and exists (
        select 1 from public.profiles pr
        where pr.id = auth.uid() and pr.active and pr.role in ('admin', 'coach', 'medical')
      )
      -- y con el módulo de rendimiento habilitado
      and private.can_view('performance')
      -- Métricas que sólo se comparan con uno mismo (ej. reacción): nunca entre jugadores
      and not exists (select 1 from public.test_metrics tm where tm.id = p_metric_id and tm.individual_only)
  ),
  grouped as (
    select
      b.category_id,
      case
        when grouping(b.position_id) = 0 then 'position'
        when grouping(b.line) = 0        then 'line'
        when grouping(b.unit) = 0        then 'unit'
        else 'category'
      end as group_type,
      case
        when grouping(b.position_id) = 0 then b.position_id::text
        when grouping(b.line) = 0        then b.line
        when grouping(b.unit) = 0        then b.unit
        else 'all'
      end                                                    as group_key,
      count(*)::int                                          as n,
      avg(b.value)                                           as mean,
      stddev_samp(b.value)                                   as sd,
      percentile_cont(0.25) within group (order by b.value)  as p25,
      percentile_cont(0.50) within group (order by b.value)  as p50,
      percentile_cont(0.75) within group (order by b.value)  as p75,
      min(b.value)                                           as min_value,
      max(b.value)                                           as max_value
    from base b
    group by grouping sets (
      (b.category_id),
      (b.category_id, b.unit),
      (b.category_id, b.line),
      (b.category_id, b.position_id)
    )
  )
  select
    p_season_id, g.category_id, p_metric_id, g.group_type, g.group_key, g.n,
    round(g.mean, 3), round(g.sd, 3), round(g.p25::numeric, 3), round(g.p50::numeric, 3),
    round(g.p75::numeric, 3), g.min_value, g.max_value
  from grouped g
  where g.n >= 3
    and g.group_key is not null
$$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.test_protocols enable row level security;
alter table public.test_devices enable row level security;
alter table public.test_attempts enable row level security;
alter table public.test_attempt_voids enable row level security;
alter table public.category_test_exclusions enable row level security;
alter table public.test_metric_ranges enable row level security;

revoke all on public.test_protocols, public.test_devices, public.test_attempts, public.test_attempt_voids,
  public.category_test_exclusions, public.test_metric_ranges from anon;
grant select, insert, update on public.test_protocols to authenticated;
grant select, insert, update on public.test_devices to authenticated;
grant select, insert on public.test_attempts, public.test_attempt_voids to authenticated;
grant select, insert, update, delete on public.category_test_exclusions, public.test_metric_ranges to authenticated;

create policy test_protocols_select on public.test_protocols for select to authenticated using (true);
create policy test_protocols_admin_insert on public.test_protocols for insert to authenticated
  with check ((select private.is_admin()));
create policy test_protocols_admin_update on public.test_protocols for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy test_devices_select on public.test_devices for select to authenticated
  using ((select private.is_staff()));
create policy test_devices_insert on public.test_devices for insert to authenticated
  with check ((select private.can_edit('performance')) and created_by = auth.uid());
create policy test_devices_update on public.test_devices for update to authenticated
  using ((select private.is_admin()) or created_by = auth.uid())
  with check ((select private.is_admin()) or created_by = auth.uid());

create policy test_attempts_select on public.test_attempts for select to authenticated using (
  (select private.can_view('performance')) and (
    player_id in (select private.visible_player_ids()) or session_id in (select private.assigned_session_ids())));
create policy test_attempts_insert on public.test_attempts for insert to authenticated with check (
  (select private.can_edit('performance')) and private.can_write_session(session_id));

create policy test_attempt_voids_select on public.test_attempt_voids for select to authenticated using (
  attempt_id in (select id from public.test_attempts));
create policy test_attempt_voids_insert on public.test_attempt_voids for insert to authenticated with check (
  (select private.can_edit('performance'))
  and exists (select 1 from public.test_attempts a where a.id = attempt_id and private.can_write_session(a.session_id)));

create policy category_test_exclusions_select on public.category_test_exclusions for select to authenticated using (true);
create policy category_test_exclusions_admin on public.category_test_exclusions for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy test_metric_ranges_select on public.test_metric_ranges for select to authenticated using (true);
create policy test_metric_ranges_admin on public.test_metric_ranges for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
