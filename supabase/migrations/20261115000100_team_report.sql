-- =====================================================================
-- «Estado del equipo» (Plantel): resumen de una categoría para compartir
-- (texto para WhatsApp o PDF). Se arma con datos que el usuario ya ve;
-- acá sólo se autoriza y registra cada vez que se comparte.
-- =====================================================================
alter table public.share_log drop constraint share_log_kind_check;
alter table public.share_log add constraint share_log_kind_check
  check (kind in ('player_report_pdf', 'category_export_xlsx', 'attendance_report', 'team_report'));

create or replace function public.log_team_report(p_category_id uuid, p_format text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_staff() or not private.can_edit('sharing') then
    raise exception 'No tenés permiso para compartir reportes.' using errcode = '42501';
  end if;
  if not (private.sees_all_players() or p_category_id in (select private.my_category_ids(private.current_season_id()))) then
    raise exception 'No tenés acceso a esta categoría.' using errcode = '42501';
  end if;
  if p_format not in ('pdf', 'text') then
    raise exception 'Formato inválido.' using errcode = '22023';
  end if;
  insert into public.share_log (kind, category_id, shared_by, details)
  values ('team_report', p_category_id, auth.uid(), jsonb_build_object('format', p_format));
end
$$;
revoke all on function public.log_team_report(uuid, text) from public, anon;
grant execute on function public.log_team_report(uuid, text) to authenticated;
