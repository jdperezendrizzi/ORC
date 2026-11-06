-- =====================================================================
-- Pase de temporada ("Aplicar pases").
--
-- Pasa a los jugadores de una categoría a la temporada siguiente, todos
-- juntos (o ninguno). Por defecto sólo el admin; el admin lo puede
-- habilitar a un profe (p. ej. coordinador), que sólo aplica pases de
-- sus categorías. Al área médica no se le puede habilitar.
--
-- Módulo "season_rollover": a diferencia de los otros (por defecto sí,
-- el admin restringe), éste arranca en "none" y el admin lo habilita.
-- Por eso se separa el valor POR DEFECTO del MÁXIMO del rol.
-- =====================================================================
alter type public.app_module add value if not exists 'season_rollover';

-- Máximo que el admin puede habilitar por rol
create or replace function private.role_max_level(p_role public.app_role, p_module public.app_module)
returns public.module_level
language sql immutable set search_path = ''
as $$
  select case
    when p_module::text = 'season_rollover' then
      case p_role when 'admin' then 'edit' when 'coach' then 'edit' else 'none' end
    else private.role_default_level(p_role, p_module)::text
  end::public.module_level
$$;

-- Valor por defecto (sin ajuste del admin)
create or replace function private.role_default_level(p_role public.app_role, p_module public.app_module)
returns public.module_level
language sql immutable set search_path = ''
as $$
  select case
    when p_module::text = 'season_rollover' then case p_role when 'admin' then 'edit' else 'none' end
    else case p_role
      when 'admin' then 'edit'
      when 'coach' then 'edit'
      when 'medical' then case p_module::text
        when 'performance' then 'view'
        when 'attendance'  then 'view'
        when 'objectives'  then 'none'
        when 'promotion'   then 'view'
        else 'edit'
      end
      else 'none'
    end
  end::public.module_level
$$;

-- Nivel efectivo: el ajuste del admin (o el valor por defecto), sin pasar el máximo del rol
create or replace function private.module_level(p_module public.app_module)
returns public.module_level
language sql stable security definer set search_path = ''
as $$
  select case
    when p.id is null or not p.active then 'none'::public.module_level
    when p.role = 'admin' then 'edit'::public.module_level
    else least(coalesce(o.level, private.role_default_level(p.role, p_module)), private.role_max_level(p.role, p_module))
  end
  from (select auth.uid() as uid) u
  left join public.profiles p on p.id = u.uid
  left join public.user_module_permissions o on o.profile_id = p.id and o.module = p_module
$$;

revoke all on function private.role_max_level(public.app_role, public.app_module) from public, anon;
grant execute on function private.role_max_level(public.app_role, public.app_module) to authenticated;

-- ---------------------------------------------------------------------
-- Aplica los pases. p_moves: [{"player_id": ..., "category_id": ...}]
-- (category_id = categoría en la temporada destino). Todo o nada.
-- Los que ya tienen categoría en la temporada destino se saltean.
-- Devuelve {"applied": n, "skipped": n}.
-- ---------------------------------------------------------------------
create or replace function public.apply_promotions(p_from_season uuid, p_to_season uuid, p_moves jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin    boolean := private.is_admin();
  v_from     public.seasons;
  v_to       public.seasons;
  v_move     jsonb;
  v_player   uuid;
  v_target   uuid;
  v_psc      public.player_season_categories;
  v_applied  int := 0;
  v_skipped  int := 0;
begin
  if private.module_level('season_rollover'::text::public.app_module) <> 'edit' then
    raise exception 'No tenés permiso para aplicar pases de temporada.' using errcode = '42501';
  end if;
  select * into v_from from public.seasons where id = p_from_season;
  select * into v_to from public.seasons where id = p_to_season;
  if v_from.id is null or v_to.id is null then
    raise exception 'Temporada inexistente.' using errcode = '22023';
  end if;
  if v_to.starts_on <= v_from.starts_on then
    raise exception 'La temporada destino tiene que ser posterior a la de origen.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_moves) <> 'array' or jsonb_array_length(p_moves) = 0 then
    raise exception 'No hay jugadores para pasar.' using errcode = '22023';
  end if;

  for v_move in select * from jsonb_array_elements(p_moves) loop
    v_player := (v_move ->> 'player_id')::uuid;
    v_target := (v_move ->> 'category_id')::uuid;

    select * into v_psc from public.player_season_categories
    where player_id = v_player and season_id = p_from_season;
    if v_psc.id is null then
      raise exception 'Un jugador no está en la temporada de origen.' using errcode = '22023';
    end if;
    -- Un profe habilitado sólo pasa jugadores de sus categorías
    if not v_admin and v_psc.category_id not in (select private.my_category_ids(p_from_season)) then
      raise exception 'Sólo podés aplicar pases de tus categorías.' using errcode = '42501';
    end if;
    if not exists (select 1 from public.categories c where c.id = v_target and c.active) then
      raise exception 'Categoría destino inválida.' using errcode = '22023';
    end if;

    if exists (select 1 from public.player_season_categories where player_id = v_player and season_id = p_to_season) then
      v_skipped := v_skipped + 1;
    else
      insert into public.player_season_categories (player_id, season_id, category_id, position_id)
      values (v_player, p_to_season, v_target, v_psc.position_id);
      v_applied := v_applied + 1;
    end if;
  end loop;

  return jsonb_build_object('applied', v_applied, 'skipped', v_skipped);
end
$$;
revoke all on function public.apply_promotions(uuid, uuid, jsonb) from public, anon;
grant execute on function public.apply_promotions(uuid, uuid, jsonb) to authenticated;
