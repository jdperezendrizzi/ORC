-- =====================================================================
-- Asistencia a prácticas y partidos (todas las categorías).
--
-- Una fila por jugador × categoría × día. El id lo genera el celular
-- (carga sin señal): volver a marcar el mismo día pisa la misma fila.
-- "Práctica" = cualquier día con asistencia tomada en la categoría.
-- Asistencia % = presentes / (presentes + ausentes); los justificados
-- no cuentan. Registro básico del club: no pide consentimiento.
-- =====================================================================
create type public.attendance_kind as enum ('practice', 'match');
create type public.attendance_status as enum ('present', 'absent', 'excused');

create table public.attendance (
  id           uuid primary key,                       -- lo genera el celular
  player_id    uuid not null references public.players (id) on delete cascade,
  category_id  uuid not null references public.categories (id) on delete cascade,
  season_id    uuid not null references public.seasons (id),
  att_date     date not null,
  kind         public.attendance_kind not null default 'practice',
  status       public.attendance_status not null,
  note         text check (char_length(note) <= 200),
  recorded_by  uuid references public.profiles (id) default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index attendance_one_per_day_idx on public.attendance (player_id, category_id, att_date);
create index attendance_category_idx on public.attendance (category_id, season_id, att_date);
create index attendance_player_idx on public.attendance (player_id, season_id, att_date);

create or replace function private.attendance_before()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.player_id   := old.player_id;
    new.category_id := old.category_id;
    new.season_id   := old.season_id;
    new.att_date    := old.att_date;
    new.created_at  := old.created_at;
    new.updated_at  := now();
  else
    if not exists (
      select 1 from public.player_season_categories psc
      where psc.player_id = new.player_id and psc.season_id = new.season_id and psc.category_id = new.category_id
    ) then
      raise exception 'El jugador no está en esa categoría esta temporada.' using errcode = '23514';
    end if;
  end if;
  -- Margen de un día por la zona horaria (Argentina vs. UTC).
  if new.att_date > current_date + 1 then
    raise exception 'La fecha no puede ser futura.' using errcode = '23514';
  end if;
  new.recorded_by := auth.uid();
  return new;
end
$$;
revoke all on function private.attendance_before() from public, anon, authenticated;

create trigger attendance_before
  before insert or update on public.attendance
  for each row execute function private.attendance_before();

create trigger audit_attendance after insert or update or delete on public.attendance
  for each row execute function private.audit_trigger();

-- ---------------------------------------------------------------------
-- RLS: el profe toma y corrige la de sus categorías; el admin todo; el
-- área médica sólo la ve.
-- ---------------------------------------------------------------------
alter table public.attendance enable row level security;

create policy attendance_select on public.attendance for select to authenticated
  using ((select private.sees_all_players()) or category_id in (select private.my_category_ids()));
create policy attendance_insert on public.attendance for insert to authenticated
  with check ((select private.is_admin()) or category_id in (select private.my_category_ids()));
create policy attendance_update on public.attendance for update to authenticated
  using ((select private.is_admin()) or category_id in (select private.my_category_ids()))
  with check ((select private.is_admin()) or category_id in (select private.my_category_ids()));
create policy attendance_admin_delete on public.attendance for delete to authenticated
  using ((select private.is_admin()));

revoke all on public.attendance from anon;
grant select, insert, update, delete on public.attendance to authenticated;
