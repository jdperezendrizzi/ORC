-- =====================================================================
-- Objetivos por jugador desde una categoría configurable (por defecto M13).
--
--   club_settings      ajustes del club (clave → valor). Lo edita el admin.
--     player_objectives_from = {"category_id": "..."}
--   Debajo de esa categoría los objetivos son DEL EQUIPO; desde esa
--   categoría (por orden) en adelante, POR JUGADOR.
--   * Un objetivo nuevo toma el tipo según el ajuste (trigger).
--   * Al cambiar el ajuste, se convierten los objetivos afectados, salvo
--     los que ya tienen marcas del otro tipo (no se pierde historial).
-- =====================================================================
create table public.club_settings (
  key         text primary key,
  value       jsonb not null,
  updated_by  uuid references public.profiles (id) default auth.uid(),
  updated_at  timestamptz not null default now()
);
alter table public.club_settings enable row level security;
create policy club_settings_select on public.club_settings for select to authenticated using (true);
create policy club_settings_admin on public.club_settings for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
revoke all on public.club_settings from anon;
grant select, insert, update, delete on public.club_settings to authenticated;
create trigger audit_club_settings after insert or update or delete on public.club_settings
  for each row execute function private.audit_trigger('key');

insert into public.club_settings (key, value)
select 'player_objectives_from', jsonb_build_object('category_id', id) from public.categories where code = 'M13'
on conflict (key) do nothing;

-- Tipo de objetivo que corresponde a una categoría según el ajuste
create or replace function private.objective_scope_for(p_category_id uuid)
returns public.objective_scope
language sql stable security definer set search_path = ''
as $$
  select case
    when c.sort_order >= coalesce(
      (select t.sort_order from public.categories t
        where t.id = ((select value ->> 'category_id' from public.club_settings where key = 'player_objectives_from'))::uuid),
      32767)
    then 'player'::public.objective_scope
    else 'team'::public.objective_scope
  end
  from public.categories c where c.id = p_category_id
$$;

create or replace function private.objectives_set_scope()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.scope := coalesce(private.objective_scope_for(new.category_id), 'team');
  return new;
end $$;
create trigger objectives_set_scope before insert on public.objectives
  for each row execute function private.objectives_set_scope();

-- Cambia el ajuste (sólo admin) y convierte los objetivos afectados.
-- Devuelve {"changed": n, "skipped": ["título (categoría)", ...]}.
create or replace function public.set_player_objectives_from(p_category_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed int := 0;
  v_skipped text[] := '{}';
  r record;
begin
  if not private.is_admin() then
    raise exception 'Sólo el admin cambia este ajuste.' using errcode = '42501';
  end if;
  if p_category_id is not null and not exists (select 1 from public.categories where id = p_category_id) then
    raise exception 'Categoría inexistente.' using errcode = '22023';
  end if;
  insert into public.club_settings (key, value)
  values ('player_objectives_from', case when p_category_id is null then '{}'::jsonb else jsonb_build_object('category_id', p_category_id) end)
  on conflict (key) do update set value = excluded.value, updated_by = auth.uid(), updated_at = now();

  for r in
    select o.id, o.title, c.name as cat, private.objective_scope_for(o.category_id) as target, o.scope
    from public.objectives o join public.categories c on c.id = o.category_id
    where o.scope <> private.objective_scope_for(o.category_id)
  loop
    if exists (
      select 1 from public.objective_checks k
      where k.objective_id = r.id and ((r.scope = 'team' and k.player_id is null) or (r.scope = 'player' and k.player_id is not null))
    ) then
      v_skipped := v_skipped || (r.title || ' (' || r.cat || ')');
    else
      update public.objectives set scope = r.target where id = r.id;
      v_changed := v_changed + 1;
    end if;
  end loop;
  return jsonb_build_object('changed', v_changed, 'skipped', to_jsonb(v_skipped));
end
$$;
revoke all on function public.set_player_objectives_from(uuid) from public, anon;
grant execute on function public.set_player_objectives_from(uuid) to authenticated;

-- Aplicar el ajuste inicial (M13) a los objetivos que ya existen
do $$
begin
  update public.objectives o set scope = private.objective_scope_for(o.category_id)
  where o.scope <> private.objective_scope_for(o.category_id)
    and not exists (select 1 from public.objective_checks k where k.objective_id = o.id);
end $$;
