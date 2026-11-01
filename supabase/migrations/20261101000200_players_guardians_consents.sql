-- =====================================================================
-- 0002 · Jugadores, datos privados, categoría por temporada, tutores y
--        consentimientos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Jugadores (datos NO sensibles, visibles para el profe de la categoría)
-- ---------------------------------------------------------------------
create table public.players (
  id                     uuid primary key default gen_random_uuid(),
  first_name             text not null,
  last_name              text not null,
  birth_date             date not null check (birth_date > date '1950-01-01'),
  sex                    public.sex not null,
  dominant_side          public.body_side,
  primary_position_id    smallint references public.positions (id),
  secondary_position_id  smallint references public.positions (id),
  photo_path             text,          -- path en Supabase Storage
  -- Cuenta del propio jugador (acceso futuro). Única si existe.
  profile_id             uuid unique references public.profiles (id) on delete set null,
  active                 boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  deleted_at             timestamptz
);
create index players_name_idx on public.players (last_name, first_name);

create trigger players_updated_at before update on public.players
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------
-- Datos personales / médicos: SOLO admin y medical
-- ---------------------------------------------------------------------
create table public.player_private (
  player_id             uuid primary key references public.players (id) on delete cascade,
  document_id           text,
  phone                 text,
  email                 text,
  address               text,
  medical_notes         text,       -- alergias, condiciones, medicación
  emergency_contact     text,
  father_height_cm      numeric(5,1) check (father_height_cm between 130 and 230),
  mother_height_cm      numeric(5,1) check (mother_height_cm between 120 and 220),
  updated_at            timestamptz not null default now()
);

create trigger player_private_updated_at before update on public.player_private
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------
-- Categoría y puesto del jugador en cada temporada.
-- Es la tabla que define QUÉ JUGADORES VE CADA PROFE.
-- ---------------------------------------------------------------------
create table public.player_season_categories (
  id             uuid primary key default gen_random_uuid(),
  player_id      uuid not null references public.players (id) on delete cascade,
  season_id      uuid not null references public.seasons (id) on delete restrict,
  category_id    uuid not null references public.categories (id) on delete restrict,
  position_id    smallint references public.positions (id),
  jersey_number  smallint check (jersey_number between 1 and 99),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (player_id, season_id)
);
create index psc_category_idx on public.player_season_categories (season_id, category_id);

create trigger psc_updated_at before update on public.player_season_categories
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------
-- Tutores
-- ---------------------------------------------------------------------
create table public.guardians (
  id           uuid primary key default gen_random_uuid(),
  full_name    text not null,
  document_id  text,
  phone        text,
  email        text,
  profile_id   uuid unique references public.profiles (id) on delete set null,  -- acceso familia (futuro)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger guardians_updated_at before update on public.guardians
  for each row execute function private.set_updated_at();

create table public.player_guardians (
  player_id     uuid not null references public.players (id) on delete cascade,
  guardian_id   uuid not null references public.guardians (id) on delete cascade,
  relationship  text not null check (relationship in ('madre', 'padre', 'tutor_legal', 'otro')),
  is_primary    boolean not null default false,
  created_at    timestamptz not null default now(),
  primary key (player_id, guardian_id)
);
create index player_guardians_guardian_idx on public.player_guardians (guardian_id);

-- ---------------------------------------------------------------------
-- Consentimientos
-- ---------------------------------------------------------------------
create table public.consent_types (
  code         text primary key,
  name         text not null,
  description  text not null,
  -- Qué habilita: lo usan los triggers de carga.
  required     boolean not null default true
);

create table public.consents (
  id                uuid primary key default gen_random_uuid(),
  player_id         uuid not null references public.players (id) on delete cascade,
  -- NULL sólo si el jugador era mayor de edad al otorgarlo (consiente él mismo).
  guardian_id       uuid references public.guardians (id) on delete restrict,
  consent_type      text not null references public.consent_types (code),
  document_version  text not null,
  granted_at        timestamptz not null default now(),
  revoked_at        timestamptz,
  evidence_path     text,          -- PDF/imagen firmada en Storage (bucket privado)
  recorded_by       uuid references public.profiles (id) default auth.uid(),
  notes             text,
  created_at        timestamptz not null default now(),
  constraint consents_revoked_chk check (revoked_at is null or revoked_at >= granted_at)
);
-- Un solo consentimiento vigente por jugador y tipo (el historial queda).
create unique index consents_one_active_idx
  on public.consents (player_id, consent_type) where revoked_at is null;

-- ---------------------------------------------------------------------
-- Helpers de edad y consentimiento
-- ---------------------------------------------------------------------
create or replace function private.age_on(p_birth date, p_on date)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round(((p_on - p_birth)::numeric / 365.25), 2)
$$;

create or replace function private.is_minor(p_player_id uuid, p_on date default current_date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select extract(year from age(p_on, p.birth_date)) < 18
  from public.players p
  where p.id = p_player_id
$$;

create or replace function private.has_active_consent(p_player_id uuid, p_consent_type text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.consents c
    where c.player_id = p_player_id
      and c.consent_type = p_consent_type
      and c.granted_at <= now()
      and c.revoked_at is null
  )
$$;

-- Bloqueo duro: lanza error si falta el consentimiento.
create or replace function private.assert_consent(p_player_id uuid, p_consent_type text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_active_consent(p_player_id, p_consent_type) then
    raise exception 'El jugador % no tiene consentimiento vigente de tipo "%"', p_player_id, p_consent_type
      using errcode = 'P0001', hint = 'consent_required';
  end if;
end
$$;

-- Validaciones del consentimiento:
--   * Menor de edad => debe firmarlo un tutor vinculado al jugador.
create or replace function private.consents_validate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.guardian_id is null then
    if private.is_minor(new.player_id, new.granted_at::date) then
      raise exception 'Jugador menor de edad: el consentimiento debe registrarlo un tutor'
        using errcode = '23514';
    end if;
  elsif not exists (
    select 1 from public.player_guardians pg
    where pg.player_id = new.player_id and pg.guardian_id = new.guardian_id
  ) then
    raise exception 'El tutor no está vinculado a este jugador' using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger consents_validate
  before insert or update of player_id, guardian_id, granted_at on public.consents
  for each row execute function private.consents_validate();

-- ---------------------------------------------------------------------
-- RLS: deny-all hasta definir políticas
-- ---------------------------------------------------------------------
alter table public.players                  enable row level security;
alter table public.player_private           enable row level security;
alter table public.player_season_categories enable row level security;
alter table public.guardians                enable row level security;
alter table public.player_guardians         enable row level security;
alter table public.consent_types            enable row level security;
alter table public.consents                 enable row level security;
