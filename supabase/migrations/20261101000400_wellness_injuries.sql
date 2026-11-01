-- =====================================================================
-- 0004 · Bienestar diario (wellness + RPE) y lesiones.
-- =====================================================================

create type public.injury_context   as enum ('match', 'training', 'other');
create type public.injury_mechanism as enum ('contact', 'non_contact', 'overuse', 'unknown');
create type public.injury_status    as enum ('active', 'rehab', 'return_to_play', 'closed');
create type public.injury_type      as enum (
  'concussion', 'muscle', 'ligament', 'tendon', 'fracture', 'dislocation',
  'contusion', 'laceration', 'joint_cartilage', 'other'
);
create type public.body_region as enum (
  'head', 'neck', 'shoulder', 'upper_arm', 'elbow', 'forearm', 'wrist_hand',
  'chest', 'thoracic_spine', 'lumbar_spine', 'abdomen', 'hip_groin',
  'thigh_anterior', 'thigh_posterior', 'knee', 'lower_leg', 'ankle', 'foot', 'other'
);

-- ---------------------------------------------------------------------
-- Bienestar: un registro por jugador y día
-- Escalas 1–5 (5 = mejor estado). RPE CR-10 (0–10).
-- ---------------------------------------------------------------------
create table public.wellness_logs (
  id               uuid primary key default gen_random_uuid(),   -- lo genera el cliente
  player_id        uuid not null references public.players (id) on delete cascade,
  log_date         date not null,
  sleep_hours      numeric(3,1) check (sleep_hours between 0 and 16),
  sleep_quality    smallint check (sleep_quality between 1 and 5),
  fatigue          smallint check (fatigue between 1 and 5),
  soreness         smallint check (soreness between 1 and 5),
  stress           smallint check (stress between 1 and 5),
  mood             smallint check (mood between 1 and 5),
  session_rpe      smallint check (session_rpe between 0 and 10),
  session_minutes  smallint check (session_minutes between 0 and 600),
  srpe_load        integer generated always as (session_rpe * session_minutes) stored,
  -- 5–25; NULL si falta algún ítem (no se compara un score incompleto).
  wellness_score   smallint generated always as (
                     sleep_quality + fatigue + soreness + stress + mood
                   ) stored,
  notes            text,
  recorded_by      uuid references public.profiles (id) default auth.uid(),
  recorded_at      timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create unique index wellness_one_per_day_idx
  on public.wellness_logs (player_id, log_date) where deleted_at is null;

create or replace function private.wellness_before()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is null then
    perform private.assert_consent(new.player_id, 'performance_data');
  end if;
  if tg_op = 'UPDATE' then
    new.player_id   := old.player_id;
    new.recorded_by := old.recorded_by;
    new.updated_at  := now();
  end if;
  return new;
end
$$;

create trigger wellness_before
  before insert or update on public.wellness_logs
  for each row execute function private.wellness_before();

-- ---------------------------------------------------------------------
-- Lesiones (registro visible para el profe: estado y disponibilidad)
-- ---------------------------------------------------------------------
create table public.injuries (
  id               uuid primary key default gen_random_uuid(),
  player_id        uuid not null references public.players (id) on delete cascade,
  occurred_on      date not null,
  context          public.injury_context not null,
  session_id       uuid references public.evaluation_sessions (id) on delete set null,
  body_region      public.body_region not null,
  injury_type      public.injury_type not null,
  side             public.body_side,
  mechanism        public.injury_mechanism not null default 'unknown',
  is_recurrence    boolean not null default false,
  status           public.injury_status not null default 'active',
  expected_return  date,
  actual_return    date,
  days_lost        integer generated always as (actual_return - occurred_on) stored,
  summary          text,      -- descripción NO clínica ("molestia isquio derecho")
  reported_by      uuid references public.profiles (id) default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  constraint injuries_return_chk check (actual_return is null or actual_return >= occurred_on),
  constraint injuries_expected_chk check (expected_return is null or expected_return >= occurred_on)
);
create index injuries_player_idx on public.injuries (player_id, occurred_on desc) where deleted_at is null;
create index injuries_open_idx on public.injuries (status) where deleted_at is null and status <> 'closed';

create trigger injuries_updated_at before update on public.injuries
  for each row execute function private.set_updated_at();

create or replace function private.injuries_before()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is null then
    perform private.assert_consent(new.player_id, 'medical_data');
  end if;
  if tg_op = 'UPDATE' then
    new.player_id   := old.player_id;
    new.reported_by := old.reported_by;
  end if;
  return new;
end
$$;

create trigger injuries_before
  before insert or update on public.injuries
  for each row execute function private.injuries_before();

-- ---------------------------------------------------------------------
-- Notas clínicas: SOLO medical / admin
-- ---------------------------------------------------------------------
create table public.injury_notes (
  id          uuid primary key default gen_random_uuid(),
  injury_id   uuid not null references public.injuries (id) on delete cascade,
  note        text not null,
  diagnosis   text,
  treatment   text,
  author_id   uuid references public.profiles (id) default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index injury_notes_injury_idx on public.injury_notes (injury_id, created_at);

create trigger injury_notes_updated_at before update on public.injury_notes
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------
-- RLS: deny-all hasta definir políticas
-- ---------------------------------------------------------------------
alter table public.wellness_logs enable row level security;
alter table public.injuries      enable row level security;
alter table public.injury_notes  enable row level security;
