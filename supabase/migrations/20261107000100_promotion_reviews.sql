-- =====================================================================
-- Pase de categoría: recomendación del profe y decisión del coordinador.
--
-- La ficha (asistencia, objetivos, físico vs. la categoría siguiente,
-- disponibilidad) se calcula en el momento; acá sólo se guarda lo que
-- se decide. Una fila por jugador y temporada.
--   * El profe de la categoría carga la recomendación.
--   * Sólo el admin carga la decisión final (lo garantiza el trigger,
--     aunque el profe intente mandar esos campos).
-- =====================================================================
create type public.promotion_outcome as enum ('promote', 'stay', 'observe');

create table public.promotion_reviews (
  id                   uuid primary key default gen_random_uuid(),
  player_id            uuid not null references public.players (id) on delete cascade,
  season_id            uuid not null references public.seasons (id),
  from_category_id     uuid not null references public.categories (id),
  target_category_id   uuid references public.categories (id),
  recommendation       public.promotion_outcome,
  recommendation_note  text check (char_length(recommendation_note) <= 1000),
  recommended_by       uuid references public.profiles (id),
  recommended_at       timestamptz,
  decision             public.promotion_outcome,
  decision_note        text check (char_length(decision_note) <= 1000),
  decided_by           uuid references public.profiles (id),
  decided_at           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (player_id, season_id)
);
create index promotion_reviews_category_idx on public.promotion_reviews (from_category_id, season_id);

create or replace function private.promotion_reviews_before()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin boolean := private.is_admin();
begin
  if tg_op = 'INSERT' then
    if not exists (
      select 1 from public.player_season_categories psc
      where psc.player_id = new.player_id and psc.season_id = new.season_id and psc.category_id = new.from_category_id
    ) then
      raise exception 'El jugador no está en esa categoría esta temporada.' using errcode = '23514';
    end if;
    if not v_admin then
      new.decision := null; new.decision_note := null;
    end if;
    new.recommended_by := null; new.recommended_at := null;
    new.decided_by := null; new.decided_at := null;
    if new.recommendation is not null or new.recommendation_note is not null then
      new.recommended_by := auth.uid(); new.recommended_at := now();
    end if;
    if new.decision is not null or new.decision_note is not null then
      new.decided_by := auth.uid(); new.decided_at := now();
    end if;
    new.created_at := now();
  else
    -- Inmutables
    new.player_id := old.player_id;
    new.season_id := old.season_id;
    new.from_category_id := old.from_category_id;
    new.created_at := old.created_at;
    -- La decisión es sólo del admin
    if not v_admin then
      new.decision := old.decision; new.decision_note := old.decision_note;
    end if;
    new.recommended_by := old.recommended_by; new.recommended_at := old.recommended_at;
    new.decided_by := old.decided_by; new.decided_at := old.decided_at;
    if new.recommendation is distinct from old.recommendation or new.recommendation_note is distinct from old.recommendation_note then
      new.recommended_by := auth.uid(); new.recommended_at := now();
    end if;
    if new.decision is distinct from old.decision or new.decision_note is distinct from old.decision_note then
      new.decided_by := auth.uid(); new.decided_at := now();
    end if;
  end if;
  new.updated_at := now();
  return new;
end
$$;
revoke all on function private.promotion_reviews_before() from public, anon, authenticated;

create trigger promotion_reviews_before
  before insert or update on public.promotion_reviews
  for each row execute function private.promotion_reviews_before();

create trigger audit_promotion_reviews after insert or update or delete on public.promotion_reviews
  for each row execute function private.audit_trigger();

alter table public.promotion_reviews enable row level security;

-- Lo ven: admin y área médica; el profe de la categoría de origen o de destino.
create policy promotion_reviews_select on public.promotion_reviews for select to authenticated
  using (
    (select private.sees_all_players())
    or from_category_id in (select private.my_category_ids())
    or target_category_id in (select private.my_category_ids())
  );
-- Lo cargan: admin, o el profe de la categoría de origen (sólo la recomendación).
create policy promotion_reviews_insert on public.promotion_reviews for insert to authenticated
  with check ((select private.is_admin()) or from_category_id in (select private.my_category_ids()));
create policy promotion_reviews_update on public.promotion_reviews for update to authenticated
  using ((select private.is_admin()) or from_category_id in (select private.my_category_ids()))
  with check ((select private.is_admin()) or from_category_id in (select private.my_category_ids()));
create policy promotion_reviews_admin_delete on public.promotion_reviews for delete to authenticated
  using ((select private.is_admin()));

revoke all on public.promotion_reviews from anon;
grant select, insert, update, delete on public.promotion_reviews to authenticated;
