-- =====================================================================
-- Tests de import_roster(): alta, actualización, todo-o-nada y permisos.
-- Transacción con ROLLBACK: no deja datos.
-- =====================================================================
begin;
\o /dev/null

create schema imp_t;
grant usage on schema imp_t to authenticated;
create function imp_t.eq(actual bigint, expected bigint, msg text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FALLA: % (esperado %, obtenido %)', msg, expected, actual;
  end if;
end $$;
grant execute on all functions in schema imp_t to authenticated;

insert into consent_types (code, name, description) values
  ('performance_data', 't', 't'), ('medical_data', 't', 't') on conflict do nothing;
update seasons set is_current = false;
insert into seasons (id, name, starts_on, ends_on, is_current)
  values ('5e000000-0000-4000-8000-0000000a2026', 'IMP-2026', '2026-01-01', '2026-12-31', true);
insert into categories (id, code, name, level) values
  ('ca000000-0000-4000-8000-0000000a0015', 'IMP-M15', 'Imp M15', 'juveniles');
insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-0000000a0001', 'imp-admin@t'),
  ('c0000000-0000-4000-8000-0000000a0001', 'imp-coach@t');
update profiles set role = 'admin', active = true where id = 'a0000000-0000-4000-8000-0000000a0001';
update profiles set role = 'coach', active = true where id = 'c0000000-0000-4000-8000-0000000a0001';

-- Jugador que ya existe (se va a actualizar)
insert into players (id, first_name, last_name, birth_date, sex)
  values ('b1000000-0000-4000-8000-0000000a0001', 'Existente', 'IMP', '2011-02-02', 'male');

-- ---------- coach no puede importar ----------
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c0000000-0000-4000-8000-0000000a0001', true);
do $$ begin
  perform public.import_roster('5e000000-0000-4000-8000-0000000a2026',
    '[{"line":2,"first_name":"X","last_name":"IMP","birth_date":"2011-01-01","sex":"male"}]');
  raise exception 'FALLA: un coach pudo importar';
exception when others then
  if sqlerrm like 'FALLA%' then raise; end if;
end $$;
reset role;

-- ---------- admin: todo o nada (fila 3 inválida) ----------
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000a0001', true);
do $$
declare v_msg text;
begin
  perform public.import_roster('5e000000-0000-4000-8000-0000000a2026', jsonb_build_array(
    jsonb_build_object('line', 2, 'first_name', 'Bueno', 'last_name', 'IMP', 'birth_date', '2011-05-05', 'sex', 'male',
                       'category_id', 'ca000000-0000-4000-8000-0000000a0015'),
    jsonb_build_object('line', 3, 'first_name', 'Malo', 'last_name', 'IMP', 'birth_date', '2011-05-05', 'sex', 'otro')
  ));
  raise exception 'FALLA: aceptó una fila inválida';
exception when others then
  v_msg := sqlerrm;
  if v_msg like 'FALLA%' then raise; end if;
  if v_msg not like 'Fila 3:%' then raise exception 'FALLA: el error no indica la fila (%)', v_msg; end if;
end $$;
select imp_t.eq((select count(*) from players where last_name = 'IMP'), 1, 'todo o nada: no quedó la fila 2');

-- ---------- admin: menor sin tutor con consentimiento => error ----------
do $$
begin
  perform public.import_roster('5e000000-0000-4000-8000-0000000a2026', jsonb_build_array(
    jsonb_build_object('line', 2, 'first_name', 'SinTutor', 'last_name', 'IMP', 'birth_date', '2011-05-05', 'sex', 'male',
                       'consents', jsonb_build_array(jsonb_build_object('type', 'performance_data', 'date', '2026-03-01')))
  ));
  raise exception 'FALLA: consentimiento de menor sin tutor';
exception when others then
  if sqlerrm like 'FALLA%' then raise; end if;
end $$;

-- ---------- admin: alta + actualización ----------
create temp table _res as
select public.import_roster('5e000000-0000-4000-8000-0000000a2026', jsonb_build_array(
  jsonb_build_object(
    'line', 2, 'first_name', 'Nuevo', 'last_name', 'IMP', 'birth_date', '2011-07-07', 'sex', 'male',
    'category_id', 'ca000000-0000-4000-8000-0000000a0015', 'jersey_number', 9, 'position_id', 9, 'document_id', '50111222',
    'guardian', jsonb_build_object('full_name', 'Ana IMP', 'relationship', 'madre', 'phone', '11-1111-1111'),
    'consents', jsonb_build_array(
      jsonb_build_object('type', 'performance_data', 'date', '2026-03-01'),
      jsonb_build_object('type', 'medical_data', 'date', '2026-03-01'))),
  jsonb_build_object(
    'line', 3, 'player_id', 'b1000000-0000-4000-8000-0000000a0001',
    'first_name', 'Existente', 'last_name', 'IMP', 'birth_date', '2011-02-02', 'sex', 'male',
    'category_id', 'ca000000-0000-4000-8000-0000000a0015', 'jersey_number', 4)
), '2026-v1') as r;
reset role;

select imp_t.eq((select (r ->> 'created')::int from _res), 1, 'creó 1 jugador');
select imp_t.eq((select (r ->> 'updated')::int from _res), 1, 'actualizó 1 jugador');
select imp_t.eq((select (r ->> 'consents')::int from _res), 2, 'registró 2 consentimientos');
select imp_t.eq((select count(*) from player_season_categories psc join players p on p.id = psc.player_id
                 where p.last_name = 'IMP' and psc.season_id = '5e000000-0000-4000-8000-0000000a2026'), 2, 'ambos en la categoría');
select imp_t.eq((select count(*) from consents c join players p on p.id = c.player_id
                 where p.first_name = 'Nuevo' and c.guardian_id is not null and c.document_version = '2026-v1'), 2,
                'consentimientos del menor firmados por el tutor');
select imp_t.eq((select count(*) from player_private pp join players p on p.id = pp.player_id
                 where p.first_name = 'Nuevo' and pp.document_id = '50111222'), 1, 'DNI guardado como dato privado');

-- Reimportar lo mismo: no duplica tutor ni consentimientos
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000a0001', true);
create temp table _res2 as
select public.import_roster('5e000000-0000-4000-8000-0000000a2026', jsonb_build_array(
  jsonb_build_object(
    'line', 2, 'player_id', (select id from players where first_name = 'Nuevo' and last_name = 'IMP'),
    'first_name', 'Nuevo', 'last_name', 'IMP', 'birth_date', '2011-07-07', 'sex', 'male',
    'category_id', 'ca000000-0000-4000-8000-0000000a0015',
    'guardian', jsonb_build_object('full_name', 'ana imp', 'relationship', 'madre'),
    'consents', jsonb_build_array(jsonb_build_object('type', 'performance_data', 'date', '2026-03-01')))
)) as r;
reset role;
select imp_t.eq((select (r ->> 'guardians')::int + (r ->> 'consents')::int from _res2), 0, 'reimportar no duplica tutor ni consentimientos');

\o
do $$ begin raise notice '03_import: OK'; end $$;
rollback;
