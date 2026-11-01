-- =====================================================================
-- 0006 · Auditoría de cambios sobre datos de menores y accesos.
-- Registra quién cambió qué y cuándo (diff de columnas en UPDATE).
-- =====================================================================

create table public.audit_log (
  id          bigint generated always as identity primary key,
  table_name  text not null,
  operation   text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  record_id   text,
  actor_id    uuid default auth.uid(),
  changed     jsonb,          -- UPDATE: {col: {old, new}} ; INSERT/DELETE: fila
  created_at  timestamptz not null default now()
);
create index audit_log_record_idx on public.audit_log (table_name, record_id);
create index audit_log_created_idx on public.audit_log (created_at desc);

create or replace function private.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old  jsonb;
  v_new  jsonb;
  v_diff jsonb;
  v_id   text;
begin
  if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('UPDATE', 'INSERT') then v_new := to_jsonb(new); end if;

  v_id := coalesce(v_new, v_old) ->> coalesce(tg_argv[0], 'id');

  if tg_op = 'UPDATE' then
    select jsonb_object_agg(k, jsonb_build_object('old', v_old -> k, 'new', v_new -> k))
      into v_diff
      from jsonb_object_keys(v_new) k
     where (v_old -> k) is distinct from (v_new -> k)
       and k not in ('updated_at', 'synced_at');
    if v_diff is null then
      return null;
    end if;
  else
    v_diff := coalesce(v_new, v_old);
  end if;

  insert into public.audit_log (table_name, operation, record_id, changed)
  values (tg_table_name, tg_op, v_id, v_diff);
  return null;
end
$$;

-- Tablas auditadas
create trigger audit_profiles after insert or update or delete on public.profiles
  for each row execute function private.audit_trigger();
create trigger audit_coach_assignments after insert or update or delete on public.coach_assignments
  for each row execute function private.audit_trigger();
create trigger audit_players after insert or update or delete on public.players
  for each row execute function private.audit_trigger();
create trigger audit_player_private after insert or update or delete on public.player_private
  for each row execute function private.audit_trigger('player_id');
create trigger audit_psc after insert or update or delete on public.player_season_categories
  for each row execute function private.audit_trigger();
create trigger audit_guardians after insert or update or delete on public.guardians
  for each row execute function private.audit_trigger();
create trigger audit_player_guardians after insert or update or delete on public.player_guardians
  for each row execute function private.audit_trigger('player_id');
create trigger audit_consents after insert or update or delete on public.consents
  for each row execute function private.audit_trigger();
create trigger audit_injuries after insert or update or delete on public.injuries
  for each row execute function private.audit_trigger();
create trigger audit_injury_notes after insert or update or delete on public.injury_notes
  for each row execute function private.audit_trigger();
-- Resultados: sólo modificaciones y bajas (las altas ya tienen recorded_by).
create trigger audit_results after update or delete on public.results
  for each row execute function private.audit_trigger();

alter table public.audit_log enable row level security;
