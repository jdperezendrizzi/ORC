-- =====================================================================
-- Evaluación ortopédica: ficha completa sólo admin/área médica, el profe
-- ve únicamente el resultado de sus jugadores, consentimiento de salud
-- obligatorio, IMC calculado, una por campaña e importación (upsert).
-- (Usa los datos de supabase/seed.sql.)
-- =====================================================================
begin;
\o /dev/null
create schema oe_t;
grant usage on schema oe_t to authenticated;
create function oe_t.is(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FALLA: %', msg; end if;
end $$;
grant execute on all functions in schema oe_t to authenticated;

create temp table ctx as
select
  (select psc.player_id from player_season_categories psc join categories c on c.id = psc.category_id
    where c.code = 'M15' and psc.season_id = (select id from seasons where is_current)
      and private.has_active_consent(psc.player_id, 'medical_data') limit 1) as p15,
  (select psc.player_id from player_season_categories psc join categories c on c.id = psc.category_id
    where c.code = 'M15' and psc.season_id = (select id from seasons where is_current)
      and not private.has_active_consent(psc.player_id, 'medical_data') limit 1) as p15_noconsent,
  (select psc.player_id from player_season_categories psc join categories c on c.id = psc.category_id
    where c.code = 'M17' and psc.season_id = (select id from seasons where is_current)
      and private.has_active_consent(psc.player_id, 'medical_data') limit 1) as p17;
grant select on ctx to authenticated;
select oe_t.is((select p15 is not null and p15_noconsent is not null and p17 is not null from ctx), 'datos del seed');

set local role authenticated;

-- ── Área médica carga la ficha ───────────────────────────────────────
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-a000-0000000000ed', true);
insert into ortho_evaluations (player_id, campaign, evaluated_on, weight_kg, height_cm, knees_status, knees_notes, indications, outcome)
values ((select p15 from ctx), 2025, '2025-11-20', 60, 170, 'observe', 'Genu valgo leve', 'Fortalecimiento', 'indications');
select oe_t.is((select bmi = 20.8 from ortho_evaluations where player_id = (select p15 from ctx) and campaign = 2025), 'IMC calculado (60 / 1,70²)');
select oe_t.is((select created_by = 'd0000000-0000-4000-a000-0000000000ed' and updated_by = created_by from ortho_evaluations where player_id = (select p15 from ctx)), 'registra quién la cargó');

do $$ begin
  insert into ortho_evaluations (player_id, campaign) values ((select p15 from ctx), 2025);
  raise exception 'FALLA: permitió dos evaluaciones en la misma campaña';
exception when unique_violation then null; end $$;

do $$ begin
  insert into ortho_evaluations (player_id, campaign) values ((select p15_noconsent from ctx), 2026);
  raise exception 'FALLA: cargó sin consentimiento de salud';
exception when others then
  if sqlerrm like 'FALLA%' then raise; end if;
end $$;

-- ── Profe M15: no ve la ficha, sí el resultado de los suyos ──────────
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-a000-000000000015', true);
select oe_t.is((select count(*) = 0 from ortho_evaluations), 'el profe no lee la ficha completa');
select oe_t.is((select count(*) = 1 and bool_and(outcome = 'indications') from public.ortho_outcomes()), 'el profe ve el resultado de su jugador');
do $$ begin
  insert into ortho_evaluations (player_id, campaign) values ((select p15 from ctx), 2026);
  raise exception 'FALLA: el profe pudo cargar una evaluación';
exception when insufficient_privilege then null; end $$;
update ortho_evaluations set outcome = 'clear';
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-a000-0000000000ed', true);
select oe_t.is((select outcome = 'indications' from ortho_evaluations where player_id = (select p15 from ctx)), 'el profe no puede modificarla');

-- ── Profe M17: no ve resultados de M15 ───────────────────────────────
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-a000-000000000017', true);
select oe_t.is((select count(*) = 0 from public.ortho_outcomes()), 'el profe de otra categoría no ve el resultado');

-- ── Importación (admin): crea, actualiza sin pisar con vacíos ────────
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-a000-000000000001', true);
select oe_t.is((
  select r = '{"created": 1, "updated": 1}'::jsonb from public.import_ortho_evaluations(jsonb_build_array(
    jsonb_build_object('line', 2, 'player_id', (select p17 from ctx), 'campaign', 2025, 'spine_status', 'normal',
                       'outcome', 'clear', 'blood_type', '0+', 'health_insurance', 'OSDE'),
    jsonb_build_object('line', 3, 'player_id', (select p15 from ctx), 'campaign', 2025, 'feet_status', 'altered',
                       'outcome', 'referred', 'referrals', 'Podólogo')
  )) r), 'import crea y actualiza');
select oe_t.is((select knees_notes = 'Genu valgo leve' and feet_status = 'altered' and outcome = 'referred' and weight_kg = 60
                  from ortho_evaluations where player_id = (select p15 from ctx) and campaign = 2025),
               'la actualización completa campos sin borrar los que venían vacíos');
select oe_t.is((select blood_type = '0+' and health_insurance = 'OSDE' from player_private where player_id = (select p17 from ctx)),
               'guarda grupo sanguíneo y obra social en la ficha privada');
do $$ begin
  perform public.import_ortho_evaluations(jsonb_build_array(
    jsonb_build_object('line', 7, 'player_id', (select p15_noconsent from ctx), 'campaign', 2025)));
  raise exception 'FALLA: importó sin consentimiento';
exception when others then
  if sqlerrm like 'FALLA%' then raise; end if;
  if sqlerrm not like 'Fila 7:%' then raise exception 'FALLA: el error no indica la fila (%)', sqlerrm; end if;
end $$;

-- El profe no puede importar
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-a000-000000000015', true);
do $$ begin
  perform public.import_ortho_evaluations(jsonb_build_array(jsonb_build_object('line', 2, 'player_id', (select p15 from ctx), 'campaign', 2026)));
  raise exception 'FALLA: el profe pudo importar';
exception when insufficient_privilege then null; end $$;

-- Auditoría
reset role;
select oe_t.is((select count(*) >= 3 from audit_log where table_name = 'ortho_evaluations'), 'los cambios quedan auditados');

\o
select 'ok 21_ortho_evaluations';
rollback;
