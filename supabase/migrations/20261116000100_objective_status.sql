-- =====================================================================
-- Objetivos con 3 estados por práctica: «Todavía no», «En progreso» y
-- «Logrado». La columna achieved (sí/no) se mantiene y la completa la
-- base (= status 'achieved'), así lo que ya la lee sigue funcionando y
-- los celulares con la versión anterior (que mandan sólo achieved) se
-- traducen solos.
-- =====================================================================
create type public.objective_status as enum ('not_yet', 'in_progress', 'achieved');

alter table public.objective_checks add column status public.objective_status;
update public.objective_checks set status = case when achieved then 'achieved' else 'not_yet' end::public.objective_status;
alter table public.objective_checks alter column status set not null;

create or replace function private.objective_checks_status()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status is null then
      -- versión anterior de la app: sólo sí/no
      new.status := case when new.achieved then 'achieved' else 'not_yet' end;
    end if;
  else
    if new.status is not distinct from old.status and new.achieved is distinct from old.achieved then
      -- versión anterior corrigiendo una marca: manda achieved, no status
      new.status := case when new.achieved then 'achieved' else 'not_yet' end;
    elsif new.status is null then
      new.status := old.status;
    end if;
  end if;
  new.achieved := new.status = 'achieved';
  return new;
end $$;

-- Antes que los demás triggers BEFORE (se ejecutan en orden alfabético).
create trigger objective_checks_a_status before insert or update on public.objective_checks
  for each row execute function private.objective_checks_status();

-- La app nueva manda status; achieved la completa el trigger.
alter table public.objective_checks alter column achieved set default false;
