-- =====================================================================
-- Compartir el «Estado del equipo»: queda registrado; exige módulo de
-- compartir y acceso a la categoría. (Usa los datos de supabase/seed.sql.)
-- =====================================================================
begin;
\o /dev/null
create schema tr_t;
grant usage on schema tr_t to authenticated;
create function tr_t.eq(actual bigint, expected bigint, msg text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then raise exception 'FALLA: % (esperado %, obtenido %)', msg, expected, actual; end if;
end $$;
create function tr_t.throws(stmt text, msg text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then return; end;
  raise exception 'FALLA: % (se esperaba error)', msg;
end $$;
grant execute on all functions in schema tr_t to authenticated;
create temp table ctx as select (select id from categories where code = 'M17') m17, (select id from categories where code = 'M15') m15;
grant select on ctx to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-a000-000000000017', true);
select public.log_team_report((select m17 from ctx), 'pdf');
select tr_t.eq((select count(*) from share_log where kind = 'team_report'), 1, 'compartir queda registrado');
select tr_t.throws($$select public.log_team_report((select m15 from ctx), 'text')$$, 'no comparte otra categoría');
select tr_t.throws($$select public.log_team_report((select m17 from ctx), 'xlsx')$$, 'formato inválido');
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-a000-000000000001', true);
insert into user_module_permissions (profile_id, module, level) values ('d0000000-0000-4000-a000-000000000017', 'sharing', 'view');
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-a000-000000000017', true);
select tr_t.throws($$select public.log_team_report((select m17 from ctx), 'text')$$, 'sin módulo Compartir no comparte');
reset role;
\o
do $$ begin raise notice '17_team_report: OK'; end $$;
rollback;
