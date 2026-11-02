-- =====================================================================
-- 0011 · Compartir y exportar información (registro + autorización).
--
-- Reglas del club:
--   * El informe de un jugador (PDF por WhatsApp) incluye SÓLO rendimiento.
--   * Si el jugador es menor, sólo se puede compartir con el consentimiento
--     "data_sharing_family" (Acceso de la familia) vigente.
--   * Todo lo que se comparte o exporta queda registrado.
--
-- La app pide autorización a la base ANTES de generar el archivo; así la
-- regla no depende sólo de la pantalla.
-- =====================================================================

create table public.share_log (
  id           bigint generated always as identity primary key,
  kind         text not null check (kind in ('player_report_pdf', 'category_export_xlsx')),
  player_id    uuid references public.players (id) on delete set null,
  category_id  uuid references public.categories (id) on delete set null,
  shared_by    uuid not null references public.profiles (id) default auth.uid(),
  details      jsonb,
  created_at   timestamptz not null default now()
);
create index share_log_player_idx on public.share_log (player_id, created_at desc);
create index share_log_created_idx on public.share_log (created_at desc);

alter table public.share_log enable row level security;

-- Lectura: admin ve todo; cada usuario ve lo que compartió.
create policy share_log_select on public.share_log for select to authenticated
  using ((select private.is_admin()) or shared_by = (select auth.uid()));
-- Escritura sólo a través de las funciones de abajo (security definer).
revoke insert, update, delete, truncate on public.share_log from authenticated, anon;

-- ---------------------------------------------------------------------
-- Autoriza (y registra) compartir el informe de un jugador.
-- Devuelve {ok: true} o lanza un error con el motivo.
-- ---------------------------------------------------------------------
create or replace function public.authorize_player_report(p_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_minor boolean;
begin
  if not private.is_staff() then
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
  if not private.is_staff() then
    raise exception 'No tenés permiso para exportar' using errcode = '42501';
  end if;
  if not (private.sees_all_players() or p_category_id in (select private.my_category_ids(private.current_season_id()))) then
    raise exception 'No tenés acceso a esta categoría' using errcode = '42501';
  end if;
  insert into public.share_log (kind, category_id, shared_by, details)
  values ('category_export_xlsx', p_category_id, auth.uid(), jsonb_build_object('rows', p_rows));
end
$$;

revoke execute on function public.authorize_player_report(uuid) from public, anon;
revoke execute on function public.log_category_export(uuid, int) from public, anon;
grant execute on function public.authorize_player_report(uuid) to authenticated;
grant execute on function public.log_category_export(uuid, int) to authenticated;
