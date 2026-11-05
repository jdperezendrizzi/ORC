-- =====================================================================
-- Permisos por módulo.
--
-- Además del rol y las categorías asignadas, cada usuario tiene un nivel
-- por módulo: none (no ve) · view (ve) · edit (carga).
--   * El ROL define el máximo (valores por defecto = comportamiento
--     anterior). Por usuario sólo se puede RESTRINGIR.
--   * El admin siempre tiene todo.
--   * Se aplica en la base: cada política de las tablas del módulo exige
--     además el nivel correspondiente.
-- Lo que no cambia: notas clínicas sólo área médica/admin, consentimientos,
-- decisión de pase y Admin sólo admin.
-- =====================================================================
create type public.app_module as enum
  ('performance', 'wellness', 'attendance', 'objectives', 'injuries', 'promotion', 'insights', 'sharing');
create type public.module_level as enum ('none', 'view', 'edit');   -- ordenado: none < view < edit

create table public.user_module_permissions (
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  module      public.app_module not null,
  level       public.module_level not null,
  updated_by  uuid references public.profiles (id) default auth.uid(),
  updated_at  timestamptz not null default now(),
  primary key (profile_id, module)
);

create or replace function private.user_module_permissions_before()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end $$;
create trigger user_module_permissions_before
  before insert or update on public.user_module_permissions
  for each row execute function private.user_module_permissions_before();
create trigger audit_user_module_permissions after insert or update or delete on public.user_module_permissions
  for each row execute function private.audit_trigger('profile_id');

alter table public.user_module_permissions enable row level security;
create policy ump_select on public.user_module_permissions for select to authenticated
  using ((select private.is_admin()) or profile_id = (select auth.uid()));
create policy ump_admin_write on public.user_module_permissions for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
revoke all on public.user_module_permissions from anon;
grant select, insert, update, delete on public.user_module_permissions to authenticated;

-- Máximo por rol (= lo que cada rol podía hacer antes de esta migración)
create or replace function private.role_default_level(p_role public.app_role, p_module public.app_module)
returns public.module_level
language sql immutable set search_path = ''
as $$
  select case p_role
    when 'admin' then 'edit'
    when 'coach' then 'edit'
    when 'medical' then case p_module
      when 'performance' then 'view'
      when 'attendance'  then 'view'
      when 'objectives'  then 'none'
      when 'promotion'   then 'view'
      else 'edit'
    end
    else 'none'
  end::public.module_level
$$;

-- Nivel efectivo del usuario actual en un módulo
create or replace function private.module_level(p_module public.app_module)
returns public.module_level
language sql stable security definer set search_path = ''
as $$
  select case
    when p.id is null or not p.active then 'none'::public.module_level
    when p.role = 'admin' then 'edit'::public.module_level
    else least(coalesce(o.level, 'edit'::public.module_level), private.role_default_level(p.role, p_module))
  end
  from (select auth.uid() as uid) u
  left join public.profiles p on p.id = u.uid
  left join public.user_module_permissions o on o.profile_id = p.id and o.module = p_module
$$;

create or replace function private.can_view(p_module public.app_module)
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(private.module_level(p_module) >= 'view', false) $$;

create or replace function private.can_edit(p_module public.app_module)
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(private.module_level(p_module) = 'edit', false) $$;

revoke all on function private.module_level(public.app_module), private.can_view(public.app_module), private.can_edit(public.app_module) from public, anon;
grant execute on function private.module_level(public.app_module), private.can_view(public.app_module), private.can_edit(public.app_module),
  private.role_default_level(public.app_role, public.app_module) to authenticated;

-- Para la app: niveles del usuario actual
create or replace function public.my_modules()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_object_agg(m, private.module_level(m)), '{}'::jsonb)
  from unnest(enum_range(null::public.app_module)) m
$$;
revoke all on function public.my_modules() from public, anon;
grant execute on function public.my_modules() to authenticated;

-- ---------------------------------------------------------------------
-- Políticas: misma condición de antes AND nivel del módulo
-- ---------------------------------------------------------------------
-- Rendimiento
alter policy sessions_select on public.evaluation_sessions using (
  (select private.can_view('performance')) and (
    (select private.sees_all_players())
    or (category_id, season_id) in (select a.category_id, a.season_id from private.my_assignments() a)
    or id in (select private.history_session_ids())));
alter policy sessions_insert on public.evaluation_sessions with check (
  (select private.can_edit('performance')) and private.can_manage_category(category_id, season_id));
alter policy sessions_update on public.evaluation_sessions
  using ((select private.can_edit('performance')) and private.can_manage_category(category_id, season_id))
  with check ((select private.can_edit('performance')) and private.can_manage_category(category_id, season_id));
alter policy results_select on public.results using (
  (select private.can_view('performance')) and (
    player_id in (select private.visible_player_ids()) or session_id in (select private.assigned_session_ids())));
alter policy results_insert on public.results with check (
  (select private.can_edit('performance')) and private.can_write_session(session_id));
alter policy results_update on public.results
  using ((select private.can_edit('performance')) and private.can_write_session(session_id))
  with check ((select private.can_edit('performance')) and private.can_write_session(session_id));

-- Bienestar
alter policy wellness_select on public.wellness_logs using (
  (select private.can_view('wellness')) and player_id in (select private.visible_player_ids()));
alter policy wellness_insert on public.wellness_logs with check (
  (select private.can_edit('wellness')) and player_id in (select private.visible_player_ids()));
alter policy wellness_update on public.wellness_logs
  using ((select private.can_edit('wellness')) and player_id in (select private.visible_player_ids()))
  with check ((select private.can_edit('wellness')) and player_id in (select private.visible_player_ids()));

-- Asistencia
alter policy attendance_select on public.attendance using (
  (select private.can_view('attendance')) and (
    (select private.sees_all_players()) or category_id in (select private.my_category_ids())));
alter policy attendance_insert on public.attendance with check (
  (select private.can_edit('attendance')) and (
    (select private.is_admin()) or category_id in (select private.my_category_ids())));
alter policy attendance_update on public.attendance
  using ((select private.can_edit('attendance')) and ((select private.is_admin()) or category_id in (select private.my_category_ids())))
  with check ((select private.can_edit('attendance')) and ((select private.is_admin()) or category_id in (select private.my_category_ids())));

-- Objetivos (el catálogo lo sigue cargando sólo el admin)
alter policy objectives_select on public.objectives using (
  (select private.can_view('objectives')) and (
    (select private.is_admin()) or category_id in (select private.my_category_ids())));
alter policy objective_checks_select on public.objective_checks using (
  (select private.can_view('objectives')) and objective_id in (select private.my_objective_ids()));
alter policy objective_checks_insert on public.objective_checks with check (
  (select private.can_edit('objectives')) and objective_id in (select private.my_objective_ids()));
alter policy objective_checks_update on public.objective_checks
  using ((select private.can_edit('objectives')) and objective_id in (select private.my_objective_ids()))
  with check ((select private.can_edit('objectives')) and objective_id in (select private.my_objective_ids()));

-- Lesiones (las notas clínicas siguen siendo sólo área médica/admin)
alter policy injuries_select on public.injuries using (
  (select private.can_view('injuries')) and player_id in (select private.visible_player_ids()));
alter policy injuries_insert on public.injuries with check (
  (select private.can_edit('injuries')) and player_id in (select private.visible_player_ids()));
alter policy injuries_manage on public.injuries
  using ((select private.can_edit('injuries')) and (select private.sees_all_players()))
  with check ((select private.can_edit('injuries')) and (select private.sees_all_players()));
alter policy injury_notes_all on public.injury_notes
  using ((select private.can_view('injuries')) and (select private.sees_all_players()))
  with check ((select private.can_edit('injuries')) and (select private.sees_all_players()));

-- Pase de categoría (la decisión sigue siendo sólo del admin: trigger)
alter policy promotion_reviews_select on public.promotion_reviews using (
  (select private.can_view('promotion')) and (
    (select private.sees_all_players())
    or from_category_id in (select private.my_category_ids())
    or target_category_id in (select private.my_category_ids())));
alter policy promotion_reviews_insert on public.promotion_reviews with check (
  (select private.can_edit('promotion')) and (
    (select private.is_admin()) or from_category_id in (select private.my_category_ids())));
alter policy promotion_reviews_update on public.promotion_reviews
  using ((select private.can_edit('promotion')) and ((select private.is_admin()) or from_category_id in (select private.my_category_ids())))
  with check ((select private.can_edit('promotion')) and ((select private.is_admin()) or from_category_id in (select private.my_category_ids())));

-- Resumen semanal (ver = leer; cargar = generarlo)
alter policy weekly_summaries_select on public.weekly_summaries using (
  (select private.can_view('insights')) and (select private.is_staff())
  and ((select private.sees_all_players()) or category_id in (select private.my_category_ids())));
alter policy weekly_summaries_insert on public.weekly_summaries with check (
  (select private.can_edit('insights')) and (select private.is_staff())
  and ((select private.sees_all_players()) or category_id in (select private.my_category_ids())));
alter policy weekly_summaries_update on public.weekly_summaries
  using ((select private.can_edit('insights')) and (select private.is_staff())
    and ((select private.sees_all_players()) or category_id in (select private.my_category_ids())))
  with check ((select private.can_edit('insights')) and (select private.is_staff())
    and ((select private.sees_all_players()) or category_id in (select private.my_category_ids())));

-- Benchmarks agregados: además, módulo de rendimiento
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


-- Compartir / exportar: además, módulo "Compartir" en Carga
create or replace function public.authorize_player_report(p_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_minor boolean;
begin
  if not private.is_staff() or not private.can_edit('sharing') then
    raise exception 'No tenés permiso para compartir informes' using errcode = '42501';
  end if;
  if p_player_id not in (select private.visible_player_ids()) then
    raise exception 'No tenés acceso a este jugador' using errcode = '42501';
  end if;
  v_minor := private.is_minor(p_player_id);
  if v_minor and not private.has_active_consent(p_player_id, 'data_sharing_family') then
    raise exception 'Falta el consentimiento «Acceso de la familia»: no se puede compartir el informe de un menor'
      using errcode = 'P0001', hint = 'consent_required';
  end if;
  insert into public.share_log (kind, player_id, shared_by, details)
  values ('player_report_pdf', p_player_id, auth.uid(), jsonb_build_object('minor', v_minor, 'content', 'performance'));
  return jsonb_build_object('ok', true, 'minor', v_minor);
end
$$;

-- ---------------------------------------------------------------------
-- Registra la exportación a Excel de una categoría (uso interno del staff).
-- ---------------------------------------------------------------------
create or replace function public.log_category_export(p_category_id uuid, p_rows int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_staff() or not private.can_edit('sharing') then
    raise exception 'No tenés permiso para exportar' using errcode = '42501';
  end if;
  if not (private.sees_all_players() or p_category_id in (select private.my_category_ids(private.current_season_id()))) then
    raise exception 'No tenés acceso a esta categoría' using errcode = '42501';
  end if;
  insert into public.share_log (kind, category_id, shared_by, details)
  values ('category_export_xlsx', p_category_id, auth.uid(), jsonb_build_object('rows', p_rows));
end
$$;

