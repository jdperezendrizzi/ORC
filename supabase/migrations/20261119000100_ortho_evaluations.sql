-- =====================================================================
-- Evaluación ortopédica y traumatológica (ficha anual del club).
--
-- Una evaluación por jugador por campaña (2025 = campaña 2025-2026).
-- * Ficha completa (antecedentes + examen): SOLO admin y área médica.
-- * Profe: sólo el resultado (sin hallazgos / con indicaciones / derivado)
--   de sus jugadores, vía public.ortho_outcomes().
-- * Exige el consentimiento "Datos de salud y lesiones" (medical_data).
-- * Grupo sanguíneo y obra social son datos fijos: van en player_private.
-- =====================================================================

alter table public.player_private
  add column blood_type text check (blood_type in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', '0+', '0-')),
  add column health_insurance text check (char_length(health_insurance) <= 120),
  add column health_insurance_number text check (char_length(health_insurance_number) <= 60);
comment on column public.player_private.blood_type is 'Grupo sanguíneo y factor (dato de salud).';
comment on column public.player_private.health_insurance is 'Obra social / prepaga.';
comment on column public.player_private.health_insurance_number is 'N° de afiliado.';

create type public.ortho_region_status as enum ('normal', 'observe', 'altered');
create type public.ortho_outcome as enum ('clear', 'indications', 'referred');

create table public.ortho_evaluations (
  id                     uuid primary key default gen_random_uuid(),
  player_id              uuid not null references public.players (id) on delete cascade,
  campaign               smallint not null check (campaign between 2015 and 2100),
  evaluated_on           date,
  examiner               text check (char_length(examiner) <= 120),

  -- Medidas
  weight_kg              numeric(5,1) check (weight_kg between 10 and 200),
  height_cm              numeric(5,1) check (height_cm between 80 and 230),
  bmi                    numeric(4,1) generated always as (
                           case when weight_kg is not null and height_cm is not null
                                then round(weight_kg / ((height_cm / 100) * (height_cm / 100)), 1) end
                         ) stored,

  -- Antecedentes (los completan los padres)
  allergies              text,
  relevant_conditions    text,
  usual_medication       text,
  surgeries_other        text,   -- cirugías no traumatológicas
  surgeries_ortho        text,   -- cirugías traumatológicas
  muscle_injuries        text,
  muscle_treatment       text,   -- null = no hizo tratamiento
  joint_injuries         text,
  joint_treatment        text,
  fractures              text,
  followed_to_discharge  boolean, -- seguimiento médico hasta el alta
  post_return_control    boolean, -- control evolutivo luego de la vuelta al deporte
  family_comments        text,

  -- Examen físico (lo completa el médico)
  spine_status           public.ortho_region_status,
  spine_notes            text,
  hips_status            public.ortho_region_status,
  hips_notes             text,
  knees_status           public.ortho_region_status,
  knees_notes            text,
  feet_status            public.ortho_region_status,
  feet_notes             text,
  mobility_shoulders     text,
  mobility_hips          text,
  mobility_ankles        text,
  sit_reach_cm           numeric(4,1) check (sit_reach_cm between -40 and 60),
  thomas_test            text,
  observations           text,
  injury_evolution       text,
  studies                text,
  referrals              text,
  indications            text,
  outcome                public.ortho_outcome,

  created_by             uuid references public.profiles (id) default auth.uid(),
  updated_by             uuid references public.profiles (id) default auth.uid(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (player_id, campaign)
);
create index ortho_evaluations_campaign_idx on public.ortho_evaluations (campaign);
comment on table public.ortho_evaluations is
  'Ficha traumatológica anual (antecedentes + examen físico). Sólo admin y área médica; el profe ve sólo el resultado.';

create or replace function private.ortho_evaluations_before()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_consent(new.player_id, 'medical_data');
  if tg_op = 'UPDATE' then
    new.player_id  := old.player_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end
$$;

create trigger ortho_evaluations_before
  before insert or update on public.ortho_evaluations
  for each row execute function private.ortho_evaluations_before();
create trigger audit_ortho_evaluations after insert or update or delete on public.ortho_evaluations
  for each row execute function private.audit_trigger('player_id');

alter table public.ortho_evaluations enable row level security;
create policy ortho_select on public.ortho_evaluations for select to authenticated
  using ((select private.sees_all_players()));
create policy ortho_insert on public.ortho_evaluations for insert to authenticated
  with check ((select private.sees_all_players()));
create policy ortho_update on public.ortho_evaluations for update to authenticated
  using ((select private.sees_all_players())) with check ((select private.sees_all_players()));
create policy ortho_delete on public.ortho_evaluations for delete to authenticated
  using ((select private.is_admin()));
revoke all on public.ortho_evaluations from anon;
grant select, insert, update, delete on public.ortho_evaluations to authenticated;

-- ---------------------------------------------------------------------
-- Resultado (sin detalle médico) para el staff, sólo de jugadores visibles
-- ---------------------------------------------------------------------
create or replace function public.ortho_outcomes(p_player_ids uuid[] default null)
returns table (player_id uuid, campaign smallint, evaluated_on date, outcome public.ortho_outcome)
language sql
stable
security definer
set search_path = ''
as $$
  select e.player_id, e.campaign, e.evaluated_on, e.outcome
  from public.ortho_evaluations e
  where private.is_staff()
    and e.player_id in (select private.visible_player_ids())
    and (p_player_ids is null or e.player_id = any (p_player_ids))
  order by e.player_id, e.campaign
$$;
revoke all on function public.ortho_outcomes(uuid[]) from public, anon;
grant execute on function public.ortho_outcomes(uuid[]) to authenticated;

-- ---------------------------------------------------------------------
-- Importación desde planilla (admin / área médica). Upsert por
-- (jugador, campaña): una fila reemplaza los campos que trae completos.
-- ---------------------------------------------------------------------
create or replace function public.import_ortho_evaluations(p_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r          jsonb;
  v_line     int;
  v_player   uuid;
  v_created  int := 0;
  v_updated  int := 0;
  v_existed  boolean;
begin
  if not private.sees_all_players() then
    raise exception 'Sólo el admin o el área médica pueden importar evaluaciones' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'No hay filas para importar' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 1000 then
    raise exception 'Máximo 1000 filas por importación' using errcode = '22023';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_line := (r ->> 'line')::int;
    begin
      v_player := (r ->> 'player_id')::uuid;
      v_existed := exists (
        select 1 from public.ortho_evaluations
         where player_id = v_player and campaign = (r ->> 'campaign')::smallint
      );

      insert into public.ortho_evaluations as e (
        player_id, campaign, evaluated_on, examiner, weight_kg, height_cm,
        allergies, relevant_conditions, usual_medication, surgeries_other, surgeries_ortho,
        muscle_injuries, muscle_treatment, joint_injuries, joint_treatment, fractures,
        followed_to_discharge, post_return_control, family_comments,
        spine_status, spine_notes, hips_status, hips_notes, knees_status, knees_notes,
        feet_status, feet_notes, mobility_shoulders, mobility_hips, mobility_ankles,
        sit_reach_cm, thomas_test, observations, injury_evolution, studies, referrals,
        indications, outcome
      ) values (
        v_player, (r ->> 'campaign')::smallint, nullif(r ->> 'evaluated_on', '')::date,
        nullif(r ->> 'examiner', ''), nullif(r ->> 'weight_kg', '')::numeric, nullif(r ->> 'height_cm', '')::numeric,
        nullif(r ->> 'allergies', ''), nullif(r ->> 'relevant_conditions', ''), nullif(r ->> 'usual_medication', ''),
        nullif(r ->> 'surgeries_other', ''), nullif(r ->> 'surgeries_ortho', ''),
        nullif(r ->> 'muscle_injuries', ''), nullif(r ->> 'muscle_treatment', ''),
        nullif(r ->> 'joint_injuries', ''), nullif(r ->> 'joint_treatment', ''), nullif(r ->> 'fractures', ''),
        (r ->> 'followed_to_discharge')::boolean, (r ->> 'post_return_control')::boolean,
        nullif(r ->> 'family_comments', ''),
        nullif(r ->> 'spine_status', '')::public.ortho_region_status, nullif(r ->> 'spine_notes', ''),
        nullif(r ->> 'hips_status', '')::public.ortho_region_status, nullif(r ->> 'hips_notes', ''),
        nullif(r ->> 'knees_status', '')::public.ortho_region_status, nullif(r ->> 'knees_notes', ''),
        nullif(r ->> 'feet_status', '')::public.ortho_region_status, nullif(r ->> 'feet_notes', ''),
        nullif(r ->> 'mobility_shoulders', ''), nullif(r ->> 'mobility_hips', ''), nullif(r ->> 'mobility_ankles', ''),
        nullif(r ->> 'sit_reach_cm', '')::numeric, nullif(r ->> 'thomas_test', ''),
        nullif(r ->> 'observations', ''), nullif(r ->> 'injury_evolution', ''), nullif(r ->> 'studies', ''),
        nullif(r ->> 'referrals', ''), nullif(r ->> 'indications', ''),
        nullif(r ->> 'outcome', '')::public.ortho_outcome
      )
      on conflict (player_id, campaign) do update set
        evaluated_on          = coalesce(excluded.evaluated_on, e.evaluated_on),
        examiner              = coalesce(excluded.examiner, e.examiner),
        weight_kg             = coalesce(excluded.weight_kg, e.weight_kg),
        height_cm             = coalesce(excluded.height_cm, e.height_cm),
        allergies             = coalesce(excluded.allergies, e.allergies),
        relevant_conditions   = coalesce(excluded.relevant_conditions, e.relevant_conditions),
        usual_medication      = coalesce(excluded.usual_medication, e.usual_medication),
        surgeries_other       = coalesce(excluded.surgeries_other, e.surgeries_other),
        surgeries_ortho       = coalesce(excluded.surgeries_ortho, e.surgeries_ortho),
        muscle_injuries       = coalesce(excluded.muscle_injuries, e.muscle_injuries),
        muscle_treatment      = coalesce(excluded.muscle_treatment, e.muscle_treatment),
        joint_injuries        = coalesce(excluded.joint_injuries, e.joint_injuries),
        joint_treatment       = coalesce(excluded.joint_treatment, e.joint_treatment),
        fractures             = coalesce(excluded.fractures, e.fractures),
        followed_to_discharge = coalesce(excluded.followed_to_discharge, e.followed_to_discharge),
        post_return_control   = coalesce(excluded.post_return_control, e.post_return_control),
        family_comments       = coalesce(excluded.family_comments, e.family_comments),
        spine_status          = coalesce(excluded.spine_status, e.spine_status),
        spine_notes           = coalesce(excluded.spine_notes, e.spine_notes),
        hips_status           = coalesce(excluded.hips_status, e.hips_status),
        hips_notes            = coalesce(excluded.hips_notes, e.hips_notes),
        knees_status          = coalesce(excluded.knees_status, e.knees_status),
        knees_notes           = coalesce(excluded.knees_notes, e.knees_notes),
        feet_status           = coalesce(excluded.feet_status, e.feet_status),
        feet_notes            = coalesce(excluded.feet_notes, e.feet_notes),
        mobility_shoulders    = coalesce(excluded.mobility_shoulders, e.mobility_shoulders),
        mobility_hips         = coalesce(excluded.mobility_hips, e.mobility_hips),
        mobility_ankles       = coalesce(excluded.mobility_ankles, e.mobility_ankles),
        sit_reach_cm          = coalesce(excluded.sit_reach_cm, e.sit_reach_cm),
        thomas_test           = coalesce(excluded.thomas_test, e.thomas_test),
        observations          = coalesce(excluded.observations, e.observations),
        injury_evolution      = coalesce(excluded.injury_evolution, e.injury_evolution),
        studies               = coalesce(excluded.studies, e.studies),
        referrals             = coalesce(excluded.referrals, e.referrals),
        indications           = coalesce(excluded.indications, e.indications),
        outcome               = coalesce(excluded.outcome, e.outcome);

      if v_existed then v_updated := v_updated + 1; else v_created := v_created + 1; end if;

      -- Datos fijos (grupo sanguíneo, obra social): completan / actualizan la ficha privada
      if coalesce(nullif(r ->> 'blood_type', ''), nullif(r ->> 'health_insurance', ''), nullif(r ->> 'health_insurance_number', '')) is not null then
        insert into public.player_private (player_id, blood_type, health_insurance, health_insurance_number)
        values (v_player, nullif(r ->> 'blood_type', ''), nullif(r ->> 'health_insurance', ''), nullif(r ->> 'health_insurance_number', ''))
        on conflict (player_id) do update set
          blood_type              = coalesce(excluded.blood_type, public.player_private.blood_type),
          health_insurance        = coalesce(excluded.health_insurance, public.player_private.health_insurance),
          health_insurance_number = coalesce(excluded.health_insurance_number, public.player_private.health_insurance_number);
      end if;
    exception when others then
      raise exception 'Fila %: %', v_line, sqlerrm using errcode = sqlstate;
    end;
  end loop;

  return jsonb_build_object('created', v_created, 'updated', v_updated);
end
$$;
revoke all on function public.import_ortho_evaluations(jsonb) from public, anon;
grant execute on function public.import_ortho_evaluations(jsonb) to authenticated;
