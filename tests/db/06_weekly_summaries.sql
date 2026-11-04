-- =====================================================================
-- Resumen semanal: lo ven/generan el profe de la categoría, el área médica
-- y el admin. Un profe de otra categoría no.
-- =====================================================================
begin;
\o /dev/null

create schema ws_t;
grant usage on schema ws_t to authenticated, anon;
create function ws_t.eq(actual bigint, expected bigint, msg text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then raise exception 'FALLA: % (esperado %, obtenido %)', msg, expected, actual; end if;
end $$;
create function ws_t.throws(stmt text, msg text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then return; end;
  raise exception 'FALLA: % (se esperaba error)', msg;
end $$;
grant execute on all functions in schema ws_t to authenticated, anon;

update seasons set is_current = false;
insert into seasons (id, name, starts_on, ends_on, is_current)
  values ('5e000000-0000-4000-8000-0000000d2026', 'WS-2026', '2026-01-01', '2026-12-31', true);
insert into categories (id, code, name, level) values
  ('ca000000-0000-4000-8000-0000000d000a', 'WS-A', 'Ws A', 'juveniles'),
  ('ca000000-0000-4000-8000-0000000d000b', 'WS-B', 'Ws B', 'juveniles');
insert into auth.users (id, email) values
  ('c0000000-0000-4000-8000-0000000d0001', 'ws-coach-a@t'),
  ('c0000000-0000-4000-8000-0000000d0002', 'ws-coach-b@t'),
  ('c0000000-0000-4000-8000-0000000d0003', 'ws-med@t');
update profiles set role = 'coach', active = true
  where id in ('c0000000-0000-4000-8000-0000000d0001', 'c0000000-0000-4000-8000-0000000d0002');
update profiles set role = 'medical', active = true where id = 'c0000000-0000-4000-8000-0000000d0003';
insert into coach_assignments (profile_id, category_id, season_id) values
  ('c0000000-0000-4000-8000-0000000d0001', 'ca000000-0000-4000-8000-0000000d000a', '5e000000-0000-4000-8000-0000000d2026'),
  ('c0000000-0000-4000-8000-0000000d0002', 'ca000000-0000-4000-8000-0000000d000b', '5e000000-0000-4000-8000-0000000d2026');

set local role authenticated;

-- Profe A genera el de su categoría (y lo actualiza con upsert)
select set_config('request.jwt.claim.sub', 'c0000000-0000-4000-8000-0000000d0001', true);
insert into public.weekly_summaries (category_id, week_start, period_from, period_to, content, generator)
values ('ca000000-0000-4000-8000-0000000d000a', '2026-11-02', '2026-10-27', '2026-11-02', 'v1', 'plantilla');
insert into public.weekly_summaries (category_id, week_start, period_from, period_to, content, generator)
values ('ca000000-0000-4000-8000-0000000d000a', '2026-11-02', '2026-10-27', '2026-11-02', 'v2', 'plantilla')
on conflict (category_id, week_start) do update set content = excluded.content;
select ws_t.eq((select count(*) from public.weekly_summaries where content = 'v2'), 1, 'profe A genera y actualiza su resumen');
select ws_t.throws($$insert into public.weekly_summaries (category_id, week_start, period_from, period_to, content, generator)
  values ('ca000000-0000-4000-8000-0000000d000b', '2026-11-02', '2026-10-27', '2026-11-02', 'x', 'plantilla')$$,
  'profe A no genera el de otra categoría');

-- Profe B no lo ve
select set_config('request.jwt.claim.sub', 'c0000000-0000-4000-8000-0000000d0002', true);
select ws_t.eq((select count(*) from public.weekly_summaries where category_id = 'ca000000-0000-4000-8000-0000000d000a'), 0, 'profe B no ve el resumen de A');

-- Área médica lo ve
select set_config('request.jwt.claim.sub', 'c0000000-0000-4000-8000-0000000d0003', true);
select ws_t.eq((select count(*) from public.weekly_summaries where category_id = 'ca000000-0000-4000-8000-0000000d000a'), 1, 'el área médica ve el resumen');

-- Anónimo: nada
reset role;
set local role anon;
select ws_t.throws($$select 1 from public.weekly_summaries$$, 'anon no accede');
reset role;

\o
do $$ begin raise notice '06_weekly_summaries: OK'; end $$;
rollback;
