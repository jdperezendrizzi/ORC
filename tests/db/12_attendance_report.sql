-- =====================================================================
-- Exportar el resumen de asistencia: queda registrado; exige módulo de
-- asistencia y de compartir, y acceso a la categoría.
-- (Usa los datos de supabase/seed.sql.)
-- =====================================================================
begin;
\o /dev/null

create schema ar_t;
grant usage on schema ar_t to authenticated;
create function ar_t.eq(actual bigint, expected bigint, msg text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then raise exception 'FALLA: % (esperado %, obtenido %)', msg, expected, actual; end if;
end $$;
create function ar_t.throws(stmt text, msg text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then return; end;
  raise exception 'FALLA: % (se esperaba error)', msg;
end $$;
grant execute on all functions in schema ar_t to authenticated;
create temp table ctx as select (select id from categories where code = 'M17') m17, (select id from categories where code = 'M15') m15;
grant select on ctx to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-a000-000000000017', true);
select public.log_attendance_export((select m17 from ctx), '2026-10-01', '2026-10-31', 'xlsx');
select ar_t.eq((select count(*) from share_log where kind = 'attendance_report'), 1, 'exportación registrada');
select ar_t.throws($$select public.log_attendance_export((select m15 from ctx), '2026-10-01', '2026-10-31', 'pdf')$$, 'no exporta otra categoría');
select ar_t.throws($$select public.log_attendance_export((select m17 from ctx), '2026-11-01', '2026-10-01', 'pdf')$$, 'período inválido');

-- Sin el módulo Compartir no exporta
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-a000-000000000001', true);
insert into user_module_permissions (profile_id, module, level) values ('d0000000-0000-4000-a000-000000000017', 'sharing', 'view');
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-a000-000000000017', true);
select ar_t.throws($$select public.log_attendance_export((select m17 from ctx), '2026-10-01', '2026-10-31', 'text')$$, 'sin módulo Compartir no exporta');
reset role;

\o
do $$ begin raise notice '12_attendance_report: OK'; end $$;
rollback;
