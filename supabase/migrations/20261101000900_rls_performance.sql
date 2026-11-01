-- =====================================================================
-- 0009 · Performance de RLS
--
-- Problema (detectado en E2E con el volumen del seed): las políticas
-- llamaban funciones POR FILA (can_see_player(player_id), y en results
-- can_see_session(), que a su vez recorría results). Postgres evalúa la
-- política antes que los filtros del usuario, así que un SELECT sobre
-- results se volvía cuadrático y con ~2.300 filas no terminaba.
--
-- Solución (patrón recomendado por Supabase): funciones que devuelven el
-- CONJUNTO de ids visibles y políticas `col in (select private.fn())`.
-- El subselect se evalúa una sola vez por consulta (InitPlan / hash).
-- La semántica de acceso NO cambia (mismos tests de 02_rls).
-- =====================================================================

-- Jugadores visibles: todos (admin/medical) o los de las categorías del
-- profe en la temporada actual.
create or replace function private.visible_player_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select p.id from public.players p
  where private.sees_all_players()
  union
  select psc.player_id
  from public.player_season_categories psc
  join public.coach_assignments ca
    on ca.category_id = psc.category_id and ca.season_id = psc.season_id
  where psc.season_id = private.current_season_id()
    and ca.profile_id = auth.uid()
    and private.my_role() = 'coach'
$$;

-- Sesiones de categorías/temporadas asignadas (o todas para admin/medical).
create or replace function private.assigned_session_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select s.id from public.evaluation_sessions s
  where private.sees_all_players()
  union
  select s.id
  from public.evaluation_sessions s
  join public.coach_assignments ca
    on ca.category_id = s.category_id and ca.season_id = s.season_id
  where ca.profile_id = auth.uid()
    and private.my_role() = 'coach'
$$;

-- Pares (categoría, temporada) asignados al profe.
create or replace function private.my_assignments()
returns table (category_id uuid, season_id uuid)
language sql stable security definer set search_path = ''
as $$
  select ca.category_id, ca.season_id
  from public.coach_assignments ca
  where ca.profile_id = auth.uid()
    and private.my_role() = 'coach'
$$;

-- Sesiones con resultados de jugadores visibles (historial del jugador
-- en otra categoría).
create or replace function private.history_session_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select distinct r.session_id
  from public.results r
  where r.deleted_at is null
    and r.player_id in (select private.visible_player_ids())
$$;

revoke all on function private.visible_player_ids() from public, anon;
revoke all on function private.assigned_session_ids() from public, anon;
revoke all on function private.my_assignments() from public, anon;
revoke all on function private.history_session_ids() from public, anon;
grant execute on function private.visible_player_ids() to authenticated, service_role;
grant execute on function private.assigned_session_ids() to authenticated, service_role;
grant execute on function private.my_assignments() to authenticated, service_role;
grant execute on function private.history_session_ids() to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Reemplazo de políticas (misma semántica)
-- ---------------------------------------------------------------------
drop policy players_select on public.players;
create policy players_select on public.players for select to authenticated
  using (id in (select private.visible_player_ids()));

drop policy players_update_coach on public.players;
create policy players_update_coach on public.players for update to authenticated
  using (id in (select private.visible_player_ids()))
  with check (id in (select private.visible_player_ids()));

drop policy consents_select on public.consents;
create policy consents_select on public.consents for select to authenticated
  using (player_id in (select private.visible_player_ids()));

-- Ojo: se evalúa sobre los VALORES de la fila (no sobre ids existentes)
-- porque INSERT ... ON CONFLICT DO UPDATE (upsert offline) exige que la
-- fila nueva también pase la política de SELECT.
drop policy sessions_select on public.evaluation_sessions;
create policy sessions_select on public.evaluation_sessions for select to authenticated
  using (
    (select private.sees_all_players())
    or (category_id, season_id) in (select a.category_id, a.season_id from private.my_assignments() a)
    or id in (select private.history_session_ids())
  );

drop policy results_select on public.results;
create policy results_select on public.results for select to authenticated
  using (
    player_id in (select private.visible_player_ids())
    or session_id in (select private.assigned_session_ids())
  );

drop policy wellness_select on public.wellness_logs;
create policy wellness_select on public.wellness_logs for select to authenticated
  using (player_id in (select private.visible_player_ids()));

drop policy wellness_insert on public.wellness_logs;
create policy wellness_insert on public.wellness_logs for insert to authenticated
  with check (player_id in (select private.visible_player_ids()));

drop policy wellness_update on public.wellness_logs;
create policy wellness_update on public.wellness_logs for update to authenticated
  using (player_id in (select private.visible_player_ids()))
  with check (player_id in (select private.visible_player_ids()));

drop policy injuries_select on public.injuries;
create policy injuries_select on public.injuries for select to authenticated
  using (player_id in (select private.visible_player_ids()));

drop policy injuries_insert on public.injuries;
create policy injuries_insert on public.injuries for insert to authenticated
  with check (player_id in (select private.visible_player_ids()));

-- Ya no se usa en políticas y era la causa del costo cuadrático.
drop function private.can_see_session(uuid);
