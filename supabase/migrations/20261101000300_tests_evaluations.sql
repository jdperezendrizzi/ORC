-- =====================================================================
-- 0003 · Catálogo de tests, sesiones de evaluación y resultados.
--
-- Modelo:  test_types (protocolo) 1─N test_metrics (lo que se mide)
--          evaluation_sessions 1─N results (jugador × métrica × intento)
--
-- Offline-first: `results.id` y `evaluation_sessions.id` los genera el
-- celular (UUID v4/v7). Reenviar el mismo registro => upsert idempotente.
-- Métricas derivadas (1RM estimado, VO2max, offset de PHV) las calcula
-- SIEMPRE la base, nunca el cliente.
-- =====================================================================

create type public.test_domain as enum (
  'anthropometry', 'strength', 'speed', 'power', 'agility', 'endurance', 'rugby'
);
create type public.best_of_rule as enum ('max', 'min', 'avg', 'last');
create type public.session_type as enum ('testing', 'match', 'training');
create type public.metric_derivation as enum ('epley_1rm', 'yoyo_ir1_vo2max', 'mirwald_offset');

-- ---------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------
create table public.test_types (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  domain      public.test_domain not null,
  protocol    text,                         -- descripción breve del protocolo
  min_age     smallint,                     -- edad mínima recomendada
  sort_order  smallint not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger test_types_updated_at before update on public.test_types
  for each row execute function private.set_updated_at();

create table public.test_metrics (
  id                uuid primary key default gen_random_uuid(),
  test_type_id      uuid not null references public.test_types (id) on delete cascade,
  code              text not null unique,
  name              text not null,
  unit              text not null,          -- kg, cm, s, %, m, nivel, reps, ml/kg/min, km/h, au, n, min
  higher_is_better  boolean not null,
  decimals          smallint not null default 1 check (decimals between 0 and 4),
  min_valid         numeric,                -- frena errores de tipeo en la cancha
  max_valid         numeric,
  is_primary        boolean not null default false,  -- métrica principal del test (gráficos)
  best_of           public.best_of_rule not null default 'max',
  -- Rol del valor como insumo de una derivada (load, reps, distance, height, sitting_height, weight)
  input_role        text,
  -- Si no es NULL, la métrica es DERIVADA y sólo la escribe la base.
  derivation        public.metric_derivation,
  required_consent  text not null default 'performance_data' references public.consent_types (code),
  sort_order        smallint not null default 0,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint test_metrics_range_chk check (min_valid is null or max_valid is null or min_valid < max_valid),
  unique (test_type_id, input_role)
);
create index test_metrics_test_idx on public.test_metrics (test_type_id);

create trigger test_metrics_updated_at before update on public.test_metrics
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------
-- Sesiones de evaluación (día de testeo, partido o entrenamiento)
-- ---------------------------------------------------------------------
create table public.evaluation_sessions (
  id            uuid primary key default gen_random_uuid(),   -- lo genera el cliente
  season_id     uuid not null references public.seasons (id) on delete restrict,
  category_id   uuid not null references public.categories (id) on delete restrict,
  session_type  public.session_type not null,
  session_date  date not null,
  title         text,
  location      text,
  opponent      text,                        -- partidos
  notes         text,
  created_by    uuid references public.profiles (id) default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index evaluation_sessions_cat_idx
  on public.evaluation_sessions (category_id, session_date desc) where deleted_at is null;

create trigger evaluation_sessions_updated_at before update on public.evaluation_sessions
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------
-- Resultados
-- ---------------------------------------------------------------------
create table public.results (
  id             uuid primary key default gen_random_uuid(),  -- lo genera el cliente
  session_id     uuid not null references public.evaluation_sessions (id) on delete cascade,
  player_id      uuid not null references public.players (id) on delete cascade,
  metric_id      uuid not null references public.test_metrics (id) on delete restrict,
  attempt        smallint not null default 1 check (attempt between 1 and 10),
  value          numeric not null,
  -- Snapshots (los completa el trigger): permiten comparar históricamente
  -- aunque el jugador cambie de categoría o de puesto.
  category_id    uuid references public.categories (id),
  position_id    smallint references public.positions (id),
  bodyweight_kg  numeric(5,1),               -- para fuerza relativa; se autocompleta
  notes          text,
  recorded_by    uuid references public.profiles (id) default auth.uid(),
  recorded_at    timestamptz not null default now(),   -- hora del celular
  synced_at      timestamptz not null default now(),   -- hora de llegada al servidor
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
create unique index results_natural_key_idx
  on public.results (session_id, player_id, metric_id, attempt) where deleted_at is null;
create index results_player_metric_idx on public.results (player_id, metric_id) where deleted_at is null;
create index results_session_idx on public.results (session_id);

-- ---------------------------------------------------------------------
-- Lógica de resultados
-- ---------------------------------------------------------------------

-- Valor (no borrado) de un insumo por rol, dentro del mismo test / sesión / intento.
create or replace function private.result_input(
  p_session_id uuid, p_player_id uuid, p_attempt smallint, p_test_type_id uuid, p_role text
)
returns numeric
language sql
stable
set search_path = ''
as $$
  select r.value
  from public.results r
  join public.test_metrics m on m.id = r.metric_id
  where r.session_id = p_session_id
    and r.player_id = p_player_id
    and r.attempt = p_attempt
    and m.test_type_id = p_test_type_id
    and m.input_role = p_role
    and r.deleted_at is null
  limit 1
$$;

-- Recalcula las métricas derivadas de un test para (sesión, jugador, intento).
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
    end case;

    if v is null then
      update public.results
         set deleted_at = now()
       where session_id = p_session_id and player_id = p_player_id
         and metric_id = m.id and attempt = p_attempt and deleted_at is null;
    else
      v := round(v, m.decimals);
      insert into public.results (session_id, player_id, metric_id, attempt, value, recorded_by)
      values (p_session_id, p_player_id, m.id, p_attempt, v, auth.uid())
      on conflict (session_id, player_id, metric_id, attempt) where deleted_at is null
      do update set value = excluded.value;
    end if;
  end loop;

  perform set_config('orc.deriving', 'off', true);
end
$$;

-- BEFORE: validaciones + snapshots + autocompletado de peso corporal.
create or replace function private.results_before()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_metric   public.test_metrics%rowtype;
  v_domain   public.test_domain;
  v_session  public.evaluation_sessions%rowtype;
begin
  select * into v_metric from public.test_metrics where id = new.metric_id;
  select domain into v_domain from public.test_types where id = v_metric.test_type_id;
  select * into v_session from public.evaluation_sessions where id = new.session_id;

  -- Derivadas: sólo las escribe la base.
  if v_metric.derivation is not null
     and coalesce(current_setting('orc.deriving', true), 'off') <> 'on' then
    raise exception 'La métrica "%" es calculada y no se puede cargar manualmente', v_metric.code
      using errcode = '42501';
  end if;

  if v_session.deleted_at is not null then
    raise exception 'La sesión fue eliminada' using errcode = '23514';
  end if;

  -- Solo se valida rango/consentimiento cuando cambia el dato (no en soft-delete).
  if new.deleted_at is null then
    if (v_metric.min_valid is not null and new.value < v_metric.min_valid)
       or (v_metric.max_valid is not null and new.value > v_metric.max_valid) then
      raise exception 'Valor % fuera de rango para "%" (% – % %)',
        new.value, v_metric.name, v_metric.min_valid, v_metric.max_valid, v_metric.unit
        using errcode = '23514', hint = 'out_of_range';
    end if;

    perform private.assert_consent(new.player_id, v_metric.required_consent);
  end if;

  if tg_op = 'INSERT' then
    new.synced_at := now();
    new.category_id := v_session.category_id;
    select coalesce(psc.position_id, p.primary_position_id)
      into new.position_id
      from public.players p
      left join public.player_season_categories psc
        on psc.player_id = p.id and psc.season_id = v_session.season_id
     where p.id = new.player_id;
  else
    -- Los snapshots y el origen no se reescriben desde el cliente.
    new.category_id := old.category_id;
    new.position_id := old.position_id;
    new.session_id  := old.session_id;
    new.player_id   := old.player_id;
    new.metric_id   := old.metric_id;
    new.recorded_by := old.recorded_by;
    new.synced_at   := old.synced_at;
    new.updated_at  := now();
  end if;

  -- Fuerza: peso corporal más reciente (≤ 60 días antes de la sesión).
  if v_domain = 'strength' and new.bodyweight_kg is null then
    select r.value into new.bodyweight_kg
      from public.results r
      join public.test_metrics m on m.id = r.metric_id and m.input_role = 'weight'
      join public.evaluation_sessions s on s.id = r.session_id
     where r.player_id = new.player_id
       and r.deleted_at is null
       and s.deleted_at is null
       and s.session_date between v_session.session_date - 60 and v_session.session_date
     order by s.session_date desc, r.recorded_at desc
     limit 1;
  end if;

  return new;
end
$$;

create trigger results_before
  before insert or update on public.results
  for each row execute function private.results_before();

-- AFTER: recalcula derivadas cuando cambia un insumo.
create or replace function private.results_after()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r       public.results%rowtype;
  v_test  uuid;
  v_role  text;
begin
  r := case when tg_op = 'DELETE' then old else new end;

  select test_type_id, input_role into v_test, v_role
    from public.test_metrics where id = r.metric_id;

  if v_role is not null then
    perform private.recompute_derived(r.session_id, r.player_id, r.attempt, v_test);
  end if;

  return null;
end
$$;

create trigger results_after
  after insert or update or delete on public.results
  for each row execute function private.results_after();

-- ---------------------------------------------------------------------
-- RLS: deny-all hasta definir políticas
-- ---------------------------------------------------------------------
alter table public.test_types          enable row level security;
alter table public.test_metrics        enable row level security;
alter table public.evaluation_sessions enable row level security;
alter table public.results             enable row level security;
