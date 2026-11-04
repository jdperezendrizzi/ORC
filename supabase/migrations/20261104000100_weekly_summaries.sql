-- =====================================================================
-- Resumen semanal por categoría (redactado por IA o por plantilla).
--
-- Privacidad: la IA externa NUNCA recibe nombres. Se le mandan números y
-- códigos (J1, J2…). Esta tabla guarda el texto con los códigos y el mapa
-- código → id de jugador; los nombres se ponen al mostrarlo, con el RLS de
-- quien lo mira.
-- =====================================================================
create table public.weekly_summaries (
  id            uuid primary key default gen_random_uuid(),
  category_id   uuid not null references public.categories (id) on delete cascade,
  week_start    date not null,                 -- lunes de la semana
  period_from   date not null,
  period_to     date not null,
  content       text not null check (char_length(content) between 1 and 4000),
  player_codes  jsonb not null default '{}'::jsonb,   -- {"J1": "<player uuid>"}
  facts         jsonb not null default '{}'::jsonb,   -- números usados (auditables)
  generator     text not null,                  -- 'plantilla' | 'groq:<modelo>'
  generated_by  uuid references public.profiles (id) default auth.uid(),
  generated_at  timestamptz not null default now(),
  unique (category_id, week_start),
  check (period_from <= period_to)
);

comment on table public.weekly_summaries is
  'Resumen semanal por categoría. Sin nombres: códigos J1.. + player_codes.';

alter table public.weekly_summaries enable row level security;

-- Staff de la categoría (profe asignado) o quien ve todo el club (admin, médico).
create policy weekly_summaries_select on public.weekly_summaries for select to authenticated
  using (
    (select private.is_staff())
    and ((select private.sees_all_players()) or category_id in (select private.my_category_ids()))
  );
create policy weekly_summaries_insert on public.weekly_summaries for insert to authenticated
  with check (
    (select private.is_staff())
    and ((select private.sees_all_players()) or category_id in (select private.my_category_ids()))
  );
create policy weekly_summaries_update on public.weekly_summaries for update to authenticated
  using (
    (select private.is_staff())
    and ((select private.sees_all_players()) or category_id in (select private.my_category_ids()))
  )
  with check (
    (select private.is_staff())
    and ((select private.sees_all_players()) or category_id in (select private.my_category_ids()))
  );

revoke all on public.weekly_summaries from anon;
grant select, insert, update on public.weekly_summaries to authenticated;

-- Quien la regenera queda como autor.
create or replace function private.weekly_summaries_before()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.generated_by := auth.uid();
  new.generated_at := now();
  return new;
end
$$;

create trigger weekly_summaries_before
  before insert or update on public.weekly_summaries
  for each row execute function private.weekly_summaries_before();
