-- =====================================================================
-- Tests de compartir/exportar: consentimiento de familia, acceso por
-- categoría y registro. Transacción con ROLLBACK.
-- =====================================================================
begin;
\o /dev/null

create schema sh_t;
grant usage on schema sh_t to authenticated;
create function sh_t.eq(actual bigint, expected bigint, msg text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then raise exception 'FALLA: % (esperado %, obtenido %)', msg, expected, actual; end if;
end $$;
create function sh_t.throws(stmt text, msg text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then return; end;
  raise exception 'FALLA: % (se esperaba error)', msg;
end $$;
grant execute on all functions in schema sh_t to authenticated;

insert into consent_types (code, name, description) values
  ('performance_data', 't', 't'), ('data_sharing_family', 't', 't') on conflict do nothing;
update seasons set is_current = false;
insert into seasons (id, name, starts_on, ends_on, is_current)
  values ('5e000000-0000-4000-8000-0000000b2026', 'SH-2026', '2026-01-01', '2026-12-31', true);
insert into categories (id, code, name, level) values
  ('ca000000-0000-4000-8000-0000000b000a', 'SH-A', 'Sh A', 'juveniles'),
  ('ca000000-0000-4000-8000-0000000b000b', 'SH-B', 'Sh B', 'juveniles');
insert into auth.users (id, email) values ('c0000000-0000-4000-8000-0000000b0001', 'sh-coach@t');
update profiles set role = 'coach', active = true where id = 'c0000000-0000-4000-8000-0000000b0001';
insert into coach_assignments (profile_id, category_id, season_id)
  values ('c0000000-0000-4000-8000-0000000b0001', 'ca000000-0000-4000-8000-0000000b000a', '5e000000-0000-4000-8000-0000000b2026');

insert into players (id, first_name, last_name, birth_date, sex) values
  ('b1000000-0000-4000-8000-0000000b0001', 'Menor', 'SH', '2011-01-01', 'male'),
  ('b1000000-0000-4000-8000-0000000b0002', 'Mayor', 'SH', '2000-01-01', 'male'),
  ('b1000000-0000-4000-8000-0000000b0003', 'Ajeno', 'SH', '2011-01-01', 'male');
insert into player_season_categories (player_id, season_id, category_id) values
  ('b1000000-0000-4000-8000-0000000b0001', '5e000000-0000-4000-8000-0000000b2026', 'ca000000-0000-4000-8000-0000000b000a'),
  ('b1000000-0000-4000-8000-0000000b0002', '5e000000-0000-4000-8000-0000000b2026', 'ca000000-0000-4000-8000-0000000b000a'),
  ('b1000000-0000-4000-8000-0000000b0003', '5e000000-0000-4000-8000-0000000b2026', 'ca000000-0000-4000-8000-0000000b000b');
insert into guardians (id, full_name) values ('9a000000-0000-4000-8000-0000000b0001', 'Tutor SH');
insert into player_guardians (player_id, guardian_id, relationship)
  values ('b1000000-0000-4000-8000-0000000b0001', '9a000000-0000-4000-8000-0000000b0001', 'madre');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c0000000-0000-4000-8000-0000000b0001', true);

select sh_t.throws($$select public.authorize_player_report('b1000000-0000-4000-8000-0000000b0001')$$,
  'menor sin consentimiento de familia: no se comparte');
select sh_t.throws($$select public.authorize_player_report('b1000000-0000-4000-8000-0000000b0003')$$,
  'jugador de otra categoría: no se comparte');
select public.authorize_player_report('b1000000-0000-4000-8000-0000000b0002');  -- mayor: ok
select sh_t.throws($$insert into public.share_log (kind, player_id, shared_by) values ('player_report_pdf', 'b1000000-0000-4000-8000-0000000b0001', 'c0000000-0000-4000-8000-0000000b0001')$$,
  'no se puede escribir el registro a mano');
select public.log_category_export('ca000000-0000-4000-8000-0000000b000a', 2);
select sh_t.throws($$select public.log_category_export('ca000000-0000-4000-8000-0000000b000b', 1)$$,
  'no exporta una categoría ajena');
reset role;

insert into consents (player_id, guardian_id, consent_type, document_version)
  values ('b1000000-0000-4000-8000-0000000b0001', '9a000000-0000-4000-8000-0000000b0001', 'data_sharing_family', 'v1');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c0000000-0000-4000-8000-0000000b0001', true);
select public.authorize_player_report('b1000000-0000-4000-8000-0000000b0001');  -- ahora sí
select sh_t.eq((select count(*) from public.share_log), 3, 'el profe ve sus 3 registros (2 informes + 1 export)');
reset role;

select sh_t.eq((select count(*) from share_log where kind = 'player_report_pdf' and shared_by = 'c0000000-0000-4000-8000-0000000b0001'), 2,
  'quedan registrados los 2 informes compartidos');

\o
do $$ begin raise notice '04_share: OK'; end $$;
rollback;
