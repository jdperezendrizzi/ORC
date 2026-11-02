-- =====================================================================
-- Lesiones cargadas sin señal: el celular reenvía la misma fila (mismo id)
-- con INSERT ... ON CONFLICT (id) DO NOTHING. Un profe no tiene permiso
-- de UPDATE sobre lesiones, así que el reenvío NO debe necesitarlo.
-- =====================================================================
begin;
\o /dev/null

create schema io_t;
grant usage on schema io_t to authenticated;
create function io_t.eq(actual bigint, expected bigint, msg text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then raise exception 'FALLA: % (esperado %, obtenido %)', msg, expected, actual; end if;
end $$;
create function io_t.throws(stmt text, msg text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then return; end;
  raise exception 'FALLA: % (se esperaba error)', msg;
end $$;
grant execute on all functions in schema io_t to authenticated;

insert into consent_types (code, name, description) values ('medical_data', 't', 't') on conflict do nothing;
update seasons set is_current = false;
insert into seasons (id, name, starts_on, ends_on, is_current)
  values ('5e000000-0000-4000-8000-0000000c2026', 'IO-2026', '2026-01-01', '2026-12-31', true);
insert into categories (id, code, name, level) values ('ca000000-0000-4000-8000-0000000c000a', 'IO-A', 'Io A', 'juveniles');
insert into auth.users (id, email) values ('c0000000-0000-4000-8000-0000000c0001', 'io-coach@t');
update profiles set role = 'coach', active = true where id = 'c0000000-0000-4000-8000-0000000c0001';
insert into coach_assignments (profile_id, category_id, season_id)
  values ('c0000000-0000-4000-8000-0000000c0001', 'ca000000-0000-4000-8000-0000000c000a', '5e000000-0000-4000-8000-0000000c2026');
insert into players (id, first_name, last_name, birth_date, sex) values
  ('b1000000-0000-4000-8000-0000000c0001', 'Con', 'IO', '2000-01-01', 'male'),
  ('b1000000-0000-4000-8000-0000000c0002', 'Sin', 'IO', '2000-01-01', 'male');
insert into player_season_categories (player_id, season_id, category_id) values
  ('b1000000-0000-4000-8000-0000000c0001', '5e000000-0000-4000-8000-0000000c2026', 'ca000000-0000-4000-8000-0000000c000a'),
  ('b1000000-0000-4000-8000-0000000c0002', '5e000000-0000-4000-8000-0000000c2026', 'ca000000-0000-4000-8000-0000000c000a');
insert into consents (player_id, consent_type, document_version)
  values ('b1000000-0000-4000-8000-0000000c0001', 'medical_data', 'v1');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c0000000-0000-4000-8000-0000000c0001', true);

-- Primer envío y reenvío idénticos: sin error y sin duplicar
insert into public.injuries (id, player_id, occurred_on, context, body_region, injury_type, status)
values ('1e000000-0000-4000-8000-0000000c0001', 'b1000000-0000-4000-8000-0000000c0001', '2026-05-01', 'match', 'knee', 'ligament', 'active')
on conflict (id) do nothing;
insert into public.injuries (id, player_id, occurred_on, context, body_region, injury_type, status)
values ('1e000000-0000-4000-8000-0000000c0001', 'b1000000-0000-4000-8000-0000000c0001', '2026-05-01', 'match', 'knee', 'ligament', 'active')
on conflict (id) do nothing;
select io_t.eq((select count(*) from public.injuries where id = '1e000000-0000-4000-8000-0000000c0001'), 1, 'reenvío offline no duplica ni falla');

-- Con DO UPDATE (lo que NO hay que usar) el reenvío de un profe falla por RLS
select io_t.throws($$insert into public.injuries (id, player_id, occurred_on, context, body_region, injury_type, status)
  values ('1e000000-0000-4000-8000-0000000c0001', 'b1000000-0000-4000-8000-0000000c0001', '2026-05-01', 'match', 'knee', 'ligament', 'active')
  on conflict (id) do update set summary = excluded.summary$$, 'DO UPDATE requiere permiso de edición que el profe no tiene');

-- Sin consentimiento de salud: falla aunque venga del celular
select io_t.throws($$insert into public.injuries (id, player_id, occurred_on, context, body_region, injury_type, status)
  values ('1e000000-0000-4000-8000-0000000c0002', 'b1000000-0000-4000-8000-0000000c0002', '2026-05-01', 'match', 'knee', 'ligament', 'active')
  on conflict (id) do nothing$$, 'sin consentimiento de salud se rechaza');
reset role;

\o
do $$ begin raise notice '05_injury_offline: OK'; end $$;
rollback;
