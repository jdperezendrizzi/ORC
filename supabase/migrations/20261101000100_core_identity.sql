-- =====================================================================
-- ORC · Sistema de rendimiento
-- 0001 · Núcleo: enums, perfiles, temporadas, categorías, puestos y
--        asignación de profes a categorías.
--
-- Convenciones
--   * Identificadores en inglés, comentarios en español.
--   * Toda tabla nace con RLS habilitado (deny-all). Las políticas se
--     definen en la migración de RLS.
--   * `private` es un schema NO expuesto por la API: helpers, triggers.
-- =====================================================================

create schema if not exists private;
revoke all on schema private from public;
-- Las políticas RLS invocan helpers de `private`, por eso el rol
-- `authenticated` necesita USAGE (pero no ve tablas: no hay ninguna).
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type public.app_role as enum ('admin', 'coach', 'medical', 'player', 'guardian');
create type public.category_level as enum ('infantiles', 'juveniles', 'plantel_superior');
create type public.sex as enum ('male', 'female');
create type public.body_side as enum ('left', 'right', 'both');
create type public.position_unit as enum ('forwards', 'backs');
create type public.position_line as enum (
  'front_row', 'second_row', 'back_row', 'halves', 'centres', 'back_three'
);

-- ---------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- ---------------------------------------------------------------------
-- Perfiles (1:1 con auth.users)
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null,
  email       text,
  role        public.app_role not null default 'coach',
  -- Una cuenta nueva NO ve nada hasta que un admin la activa.
  active      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.profiles is 'Usuarios de la app. El rol nunca se toma de metadata del cliente.';

create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

-- Crea el perfil al dar de alta un usuario en auth (invitación del admin).
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), new.email, 'Sin nombre'),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------
-- Temporadas
-- ---------------------------------------------------------------------
create table public.seasons (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  starts_on   date not null,
  ends_on     date not null,
  is_current  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint seasons_dates_chk check (ends_on > starts_on)
);
create unique index seasons_one_current_idx on public.seasons ((true)) where is_current;

create trigger seasons_updated_at before update on public.seasons
  for each row execute function private.set_updated_at();

create or replace function private.current_season_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.seasons where is_current limit 1
$$;

-- ---------------------------------------------------------------------
-- Categorías
-- ---------------------------------------------------------------------
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  level       public.category_level not null,
  -- Edad máxima en el año de la temporada (M15 => 15). NULL en plantel superior.
  max_age     smallint check (max_age between 5 and 25),
  sort_order  smallint not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger categories_updated_at before update on public.categories
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------
-- Puestos (1..15)
-- ---------------------------------------------------------------------
create table public.positions (
  id          smallint primary key check (id between 1 and 15),  -- número de camiseta
  name        text not null unique,
  short_name  text not null,
  unit        public.position_unit not null,
  line        public.position_line not null
);

-- ---------------------------------------------------------------------
-- Asignación profe ↔ categoría por temporada
-- ---------------------------------------------------------------------
create table public.coach_assignments (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  category_id  uuid not null references public.categories (id) on delete restrict,
  season_id    uuid not null references public.seasons (id) on delete restrict,
  is_head      boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (profile_id, category_id, season_id)
);
create index coach_assignments_lookup_idx on public.coach_assignments (profile_id, season_id);

-- ---------------------------------------------------------------------
-- RLS: deny-all hasta definir políticas
-- ---------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.seasons           enable row level security;
alter table public.categories        enable row level security;
alter table public.positions         enable row level security;
alter table public.coach_assignments enable row level security;
