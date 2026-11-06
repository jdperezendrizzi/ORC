-- =====================================================================
-- Resumen de asistencia (Excel / PDF / texto para compartir).
-- Se calcula con la asistencia ya cargada; acá sólo se registra cada
-- exportación en share_log, verificando permisos: módulo Asistencia
-- (ver), módulo Compartir (carga) y acceso a la categoría.
-- =====================================================================
alter table public.share_log drop constraint share_log_kind_check;
alter table public.share_log add constraint share_log_kind_check
  check (kind in ('player_report_pdf', 'category_export_xlsx', 'attendance_report'));

create or replace function public.log_attendance_export(p_category_id uuid, p_from date, p_to date, p_format text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_staff() or not private.can_view('attendance') or not private.can_edit('sharing') then
    raise exception 'No tenés permiso para exportar la asistencia.' using errcode = '42501';
  end if;
  if not (private.sees_all_players() or p_category_id in (select private.my_category_ids(private.current_season_id()))) then
    raise exception 'No tenés acceso a esta categoría.' using errcode = '42501';
  end if;
  if p_format not in ('xlsx', 'pdf', 'text') or p_from is null or p_to is null or p_from > p_to then
    raise exception 'Datos inválidos.' using errcode = '22023';
  end if;
  insert into public.share_log (kind, category_id, shared_by, details)
  values ('attendance_report', p_category_id, auth.uid(),
          jsonb_build_object('from', p_from, 'to', p_to, 'format', p_format));
end
$$;
revoke all on function public.log_attendance_export(uuid, date, date, text) from public, anon;
grant execute on function public.log_attendance_export(uuid, date, date, text) to authenticated;
