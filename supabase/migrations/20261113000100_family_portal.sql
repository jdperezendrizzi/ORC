-- =====================================================================
-- Portal de solo lectura para el JUGADOR y la FAMILIA ("Mi jugador").
--
-- Quién ve a quién (private.my_player_ids):
--   * Jugador (rol player): a sí mismo (players.profile_id). Si es menor,
--     sólo con el consentimiento "Acceso de la familia" vigente.
--   * Tutor (rol guardian): a los jugadores a su cargo
--     (guardians.profile_id + player_guardians), siempre con el
--     consentimiento "Acceso de la familia" vigente.
--   * Perfil inactivo: nada.
-- Qué ven (sólo lectura): datos básicos, categoría, asistencia, objetivos
-- y marcas físicas propias. NO: lesiones, bienestar, datos privados,
-- evaluación de pase, comparaciones ni otros jugadores.
-- Las políticas nuevas se SUMAN (OR) a las del cuerpo técnico.
-- =====================================================================
create or replace function private.is_family()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(private.my_role() in ('player', 'guardian'), false) $$;

create or replace function private.my_player_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select p.id
  from public.players p
  where private.my_role() = 'player'
    and p.profile_id = auth.uid()
    and p.active and p.deleted_at is null
    and (not private.is_minor(p.id) or private.has_active_consent(p.id, 'data_sharing_family'))
  union
  select p.id
  from public.guardians g
  join public.player_guardians pg on pg.guardian_id = g.id
  join public.players p on p.id = pg.player_id
  where private.my_role() = 'guardian'
    and g.profile_id = auth.uid()
    and p.active and p.deleted_at is null
    and private.has_active_consent(p.id, 'data_sharing_family')
$$;

-- Categorías actuales de mis jugadores (para ver sus objetivos)
create or replace function private.my_player_category_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select psc.category_id from public.player_season_categories psc
  where psc.player_id in (select private.my_player_ids())
    and psc.season_id = private.current_season_id()
$$;

-- Sesiones con resultados de mis jugadores (para fechas de sus marcas)
create or replace function private.my_player_session_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select distinct r.session_id from public.results r
  where r.player_id in (select private.my_player_ids()) and r.deleted_at is null
$$;

revoke all on function private.is_family(), private.my_player_ids(), private.my_player_category_ids(), private.my_player_session_ids() from public, anon;
grant execute on function private.is_family(), private.my_player_ids(), private.my_player_category_ids(), private.my_player_session_ids() to authenticated;

-- Catálogos (temporadas, categorías, puestos, tests)
do $$
declare t text;
begin
  foreach t in array array['seasons', 'categories', 'positions', 'test_types', 'test_metrics']
  loop
    execute format('create policy %1$s_family_select on public.%1$I for select to authenticated using ((select private.is_family()))', t);
  end loop;
end $$;

create policy players_family_select on public.players for select to authenticated
  using (id in (select private.my_player_ids()));
create policy psc_family_select on public.player_season_categories for select to authenticated
  using (player_id in (select private.my_player_ids()));
create policy attendance_family_select on public.attendance for select to authenticated
  using (player_id in (select private.my_player_ids()));
create policy objectives_family_select on public.objectives for select to authenticated
  using (active and category_id in (select private.my_player_category_ids()));
create policy objective_checks_family_select on public.objective_checks for select to authenticated
  using (
    player_id in (select private.my_player_ids())
    or (player_id is null and objective_id in (
      select o.id from public.objectives o where o.category_id in (select private.my_player_category_ids())))
  );
create policy results_family_select on public.results for select to authenticated
  using (player_id in (select private.my_player_ids()));
create policy sessions_family_select on public.evaluation_sessions for select to authenticated
  using (id in (select private.my_player_session_ids()));
