-- =====================================================================
-- 0007 · Row Level Security
--
-- Matriz de acceso
-- ┌──────────────────────────┬──────────────────────┬─────────────────────────────┬──────────────────────┐
-- │ Tabla                    │ admin                │ coach (sus categorías)      │ medical              │
-- ├──────────────────────────┼──────────────────────┼─────────────────────────────┼──────────────────────┤
-- │ catálogos                │ R/W                  │ R                           │ R                    │
-- │ profiles                 │ R/W                  │ R staff · edita su nombre   │ igual coach          │
-- │ coach_assignments        │ R/W                  │ R propias                   │ R                    │
-- │ players                  │ R/W                  │ R/U jugadores visibles      │ R todos              │
-- │ player_private           │ R/W                  │ —                           │ R/W                  │
-- │ player_season_categories │ R/W                  │ R de sus categorías         │ R                    │
-- │ guardians / p_guardians  │ R/W                  │ —                           │ R                    │
-- │ consents                 │ R/W                  │ R (estado) visibles         │ R                    │
-- │ evaluation_sessions      │ R/W                  │ R/I/U de sus categorías     │ R                    │
-- │ results                  │ R/W                  │ R visibles · I/U sus sesión │ R                    │
-- │ wellness_logs            │ R/W                  │ R/I/U visibles              │ R/I/U                │
-- │ injuries                 │ R/W                  │ R visibles · I (alta)       │ R/W                  │
-- │ injury_notes             │ R/W                  │ —                           │ R/W                  │
-- │ audit_log                │ R                    │ —                           │ —                    │
-- └──────────────────────────┴──────────────────────┴─────────────────────────────┴──────────────────────┘
-- "visibles" = jugadores asignados a una categoría del profe en la
-- temporada ACTUAL (con todo su historial). Un perfil inactivo no ve nada.
-- player / guardian: sin políticas por ahora (acceso futuro).
-- Las bajas de datos operativos son soft delete (UPDATE deleted_at);
-- el DELETE físico queda reservado al admin.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helpers (security definer => no recursión de RLS; stable => cacheables)
-- ---------------------------------------------------------------------
create or replace function private.my_role()
returns public.app_role
language sql stable security definer set search_path = ''
as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function private.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(private.my_role() = 'admin', false) $$;

create or replace function private.is_medical()
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(private.my_role() = 'medical', false) $$;

create or replace function private.is_staff()
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(private.my_role() in ('admin', 'coach', 'medical'), false) $$;

-- Ve todos los jugadores del club
create or replace function private.sees_all_players()
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(private.my_role() in ('admin', 'medical'), false) $$;

-- Categorías asignadas al profe (cualquier temporada o una en particular)
create or replace function private.my_category_ids(p_season_id uuid default null)
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select ca.category_id
  from public.coach_assignments ca
  where ca.profile_id = auth.uid()
    and private.my_role() = 'coach'
    and (p_season_id is null or ca.season_id = p_season_id)
$$;

create or replace function private.can_manage_category(p_category_id uuid, p_season_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_admin()
      or exists (
           select 1 from public.coach_assignments ca
           where ca.profile_id = auth.uid()
             and ca.category_id = p_category_id
             and ca.season_id = p_season_id
             and private.my_role() = 'coach'
         )
$$;

create or replace function private.can_see_player(p_player_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.sees_all_players()
      or exists (
           select 1
           from public.player_season_categories psc
           join public.coach_assignments ca
             on ca.category_id = psc.category_id and ca.season_id = psc.season_id
           where psc.player_id = p_player_id
             and psc.season_id = private.current_season_id()
             and ca.profile_id = auth.uid()
             and private.my_role() = 'coach'
         )
$$;

-- Sesión visible: de una categoría del profe en esa temporada, o que
-- contenga resultados de un jugador visible (historial previo del jugador
-- en otra categoría; sin esto las vistas perderían su evolución).
create or replace function private.can_see_session(p_session_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.sees_all_players()
      or exists (
           select 1 from public.evaluation_sessions s
           where s.id = p_session_id
             and s.category_id in (select private.my_category_ids(s.season_id))
         )
      or exists (
           select 1 from public.results r
           where r.session_id = p_session_id
             and r.deleted_at is null
             and private.can_see_player(r.player_id)
         )
$$;

create or replace function private.can_write_session(p_session_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.evaluation_sessions s
    where s.id = p_session_id
      and s.deleted_at is null
      and private.can_manage_category(s.category_id, s.season_id)
  )
$$;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Defensa en profundidad: anon no toca nada de public.
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke execute on function public.category_benchmarks(uuid, uuid, uuid) from public, anon;
revoke execute on function public.player_comparison(uuid, uuid) from public, anon;
grant execute on function public.category_benchmarks(uuid, uuid, uuid) to authenticated;
grant execute on function public.player_comparison(uuid, uuid) to authenticated;
-- audit_log: sólo lectura vía API (lo escriben los triggers)
revoke insert, update, delete, truncate on public.audit_log from authenticated;

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_staff()));

create policy profiles_admin_all on public.profiles for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Nadie salvo un admin cambia rol/estado (ni el propio usuario).
create or replace function private.profiles_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is not null and not private.is_admin()
     and (new.role is distinct from old.role
          or new.active is distinct from old.active
          or new.email is distinct from old.email) then
    raise exception 'Sólo un admin puede cambiar rol, estado o email' using errcode = '42501';
  end if;
  return new;
end
$$;

create trigger profiles_guard before update on public.profiles
  for each row execute function private.profiles_guard();

-- ---------------------------------------------------------------------
-- Catálogos: lectura staff, escritura admin
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['seasons', 'categories', 'positions', 'consent_types', 'test_types', 'test_metrics']
  loop
    execute format(
      'create policy %1$s_select on public.%1$I for select to authenticated using ((select private.is_staff()))', t);
    execute format(
      'create policy %1$s_admin on public.%1$I for all to authenticated
         using ((select private.is_admin())) with check ((select private.is_admin()))', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------
-- coach_assignments
-- ---------------------------------------------------------------------
create policy coach_assignments_select on public.coach_assignments for select to authenticated
  using (profile_id = (select auth.uid()) or (select private.sees_all_players()));

create policy coach_assignments_admin on public.coach_assignments for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- ---------------------------------------------------------------------
-- players
-- ---------------------------------------------------------------------
create policy players_select on public.players for select to authenticated
  using (private.can_see_player(id));

create policy players_admin on public.players for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- El profe actualiza datos deportivos (puesto, lateralidad, foto).
create policy players_update_coach on public.players for update to authenticated
  using (private.can_see_player(id)) with check (private.can_see_player(id));

-- Coach no puede tocar identidad (nombre, nacimiento, sexo, cuenta).
create or replace function private.players_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is not null and not private.is_admin()
     and (new.first_name is distinct from old.first_name
          or new.last_name  is distinct from old.last_name
          or new.birth_date is distinct from old.birth_date
          or new.sex        is distinct from old.sex
          or new.profile_id is distinct from old.profile_id
          or new.active     is distinct from old.active
          or new.deleted_at is distinct from old.deleted_at) then
    raise exception 'Sólo un admin puede modificar los datos de identidad del jugador'
      using errcode = '42501';
  end if;
  return new;
end
$$;

create trigger players_guard before update on public.players
  for each row execute function private.players_guard();

-- ---------------------------------------------------------------------
-- player_private: admin + medical
-- ---------------------------------------------------------------------
create policy player_private_all on public.player_private for all to authenticated
  using ((select private.sees_all_players())) with check ((select private.sees_all_players()));

-- ---------------------------------------------------------------------
-- player_season_categories
-- ---------------------------------------------------------------------
create policy psc_select on public.player_season_categories for select to authenticated
  using (
    (select private.sees_all_players())
    or category_id in (select private.my_category_ids(season_id))
  );

create policy psc_admin on public.player_season_categories for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- ---------------------------------------------------------------------
-- guardians / player_guardians: admin R/W, medical R
-- ---------------------------------------------------------------------
create policy guardians_select on public.guardians for select to authenticated
  using ((select private.sees_all_players()));
create policy guardians_admin on public.guardians for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy player_guardians_select on public.player_guardians for select to authenticated
  using ((select private.sees_all_players()));
create policy player_guardians_admin on public.player_guardians for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- ---------------------------------------------------------------------
-- consents: admin R/W; staff ve el estado de los jugadores visibles
-- ---------------------------------------------------------------------
create policy consents_select on public.consents for select to authenticated
  using (private.can_see_player(player_id));
create policy consents_admin on public.consents for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- ---------------------------------------------------------------------
-- evaluation_sessions
-- ---------------------------------------------------------------------
create policy sessions_select on public.evaluation_sessions for select to authenticated
  using (
    (select private.sees_all_players())
    or category_id in (select private.my_category_ids(season_id))
    or private.can_see_session(id)
  );

create policy sessions_insert on public.evaluation_sessions for insert to authenticated
  with check (private.can_manage_category(category_id, season_id));

create policy sessions_update on public.evaluation_sessions for update to authenticated
  using (private.can_manage_category(category_id, season_id))
  with check (private.can_manage_category(category_id, season_id));

create policy sessions_delete on public.evaluation_sessions for delete to authenticated
  using ((select private.is_admin()));

-- ---------------------------------------------------------------------
-- results
-- ---------------------------------------------------------------------
create policy results_select on public.results for select to authenticated
  using (private.can_see_player(player_id) or private.can_see_session(session_id));

create policy results_insert on public.results for insert to authenticated
  with check (private.can_write_session(session_id));

create policy results_update on public.results for update to authenticated
  using (private.can_write_session(session_id))
  with check (private.can_write_session(session_id));

create policy results_delete on public.results for delete to authenticated
  using ((select private.is_admin()));

-- ---------------------------------------------------------------------
-- wellness_logs
-- ---------------------------------------------------------------------
create policy wellness_select on public.wellness_logs for select to authenticated
  using (private.can_see_player(player_id));

create policy wellness_insert on public.wellness_logs for insert to authenticated
  with check (private.can_see_player(player_id));

create policy wellness_update on public.wellness_logs for update to authenticated
  using (private.can_see_player(player_id)) with check (private.can_see_player(player_id));

create policy wellness_delete on public.wellness_logs for delete to authenticated
  using ((select private.is_admin()));

-- ---------------------------------------------------------------------
-- injuries: el profe ve el estado y da el alta; medical/admin gestionan
-- ---------------------------------------------------------------------
create policy injuries_select on public.injuries for select to authenticated
  using (private.can_see_player(player_id));

create policy injuries_insert on public.injuries for insert to authenticated
  with check (private.can_see_player(player_id));

create policy injuries_manage on public.injuries for update to authenticated
  using ((select private.sees_all_players())) with check ((select private.sees_all_players()));

create policy injuries_delete on public.injuries for delete to authenticated
  using ((select private.is_admin()));

-- ---------------------------------------------------------------------
-- injury_notes: SOLO admin + medical
-- ---------------------------------------------------------------------
create policy injury_notes_all on public.injury_notes for all to authenticated
  using ((select private.sees_all_players())) with check ((select private.sees_all_players()));

-- ---------------------------------------------------------------------
-- audit_log: SOLO admin lectura
-- ---------------------------------------------------------------------
create policy audit_log_select on public.audit_log for select to authenticated
  using ((select private.is_admin()));
