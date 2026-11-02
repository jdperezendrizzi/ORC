-- =====================================================================
-- 0010 · Importación de plantel (Excel/CSV) en UNA transacción.
--
-- La app lee y valida el archivo en el navegador, muestra la vista previa
-- y manda las filas normalizadas a esta función. Si cualquier fila falla,
-- no se guarda nada (todo o nada).
--
-- security invoker: corre con los permisos de quien llama, así que la RLS
-- aplica igual que en el resto de la app (sólo un admin puede escribir).
--
-- Formato de p_rows (jsonb array):
-- [{
--   "line": 2,                       -- fila del Excel (para los mensajes)
--   "player_id": null | uuid,        -- uuid = jugador existente a actualizar
--   "first_name", "last_name", "birth_date" (YYYY-MM-DD), "sex" (male|female),
--   "category_id": uuid | null, "jersey_number": int | null, "position_id": int | null,
--   "document_id": text | null,
--   "guardian": null | { "full_name", "relationship", "phone", "email" },
--   "consents": [ { "type": "performance_data", "date": "YYYY-MM-DD" }, ... ]
-- }]
-- =====================================================================

create or replace function public.import_roster(
  p_season_id uuid,
  p_rows jsonb,
  p_document_version text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r            jsonb;
  c            jsonb;
  v_line       int;
  v_player     uuid;
  v_guardian   uuid;
  v_created    int := 0;
  v_updated    int := 0;
  v_guardians  int := 0;
  v_consents   int := 0;
  v_minor      boolean;
  v_date       date;
  v_version    text := coalesce(nullif(p_document_version, ''), 'importado');
begin
  if not private.is_admin() then
    raise exception 'Sólo un admin puede importar planteles' using errcode = '42501';
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
      -- Jugador
      if nullif(r ->> 'player_id', '') is null then
        insert into public.players (first_name, last_name, birth_date, sex, primary_position_id)
        values (
          trim(r ->> 'first_name'), trim(r ->> 'last_name'), (r ->> 'birth_date')::date,
          (r ->> 'sex')::public.sex, nullif(r ->> 'position_id', '')::smallint
        )
        returning id into v_player;
        v_created := v_created + 1;
      else
        v_player := (r ->> 'player_id')::uuid;
        update public.players
           set primary_position_id = coalesce(nullif(r ->> 'position_id', '')::smallint, primary_position_id),
               active = true
         where id = v_player;
        if not found then
          raise exception 'el jugador a actualizar no existe';
        end if;
        v_updated := v_updated + 1;
      end if;

      -- Categoría / camiseta / puesto de la temporada
      if nullif(r ->> 'category_id', '') is not null then
        insert into public.player_season_categories (player_id, season_id, category_id, position_id, jersey_number)
        values (
          v_player, p_season_id, (r ->> 'category_id')::uuid,
          nullif(r ->> 'position_id', '')::smallint, nullif(r ->> 'jersey_number', '')::smallint
        )
        on conflict (player_id, season_id) do update
          set category_id   = excluded.category_id,
              position_id   = coalesce(excluded.position_id, public.player_season_categories.position_id),
              jersey_number = coalesce(excluded.jersey_number, public.player_season_categories.jersey_number);
      end if;

      -- DNI (dato privado): sólo completa si estaba vacío
      if nullif(trim(r ->> 'document_id'), '') is not null then
        insert into public.player_private (player_id, document_id)
        values (v_player, trim(r ->> 'document_id'))
        on conflict (player_id) do update
          set document_id = coalesce(public.player_private.document_id, excluded.document_id);
      end if;

      -- Tutor: reutiliza uno ya vinculado con el mismo nombre
      v_guardian := null;
      if jsonb_typeof(r -> 'guardian') = 'object' and nullif(trim(r -> 'guardian' ->> 'full_name'), '') is not null then
        select g.id into v_guardian
          from public.player_guardians pg
          join public.guardians g on g.id = pg.guardian_id
         where pg.player_id = v_player
           and lower(trim(g.full_name)) = lower(trim(r -> 'guardian' ->> 'full_name'))
         limit 1;
        if v_guardian is null then
          insert into public.guardians (full_name, phone, email)
          values (
            trim(r -> 'guardian' ->> 'full_name'),
            nullif(trim(r -> 'guardian' ->> 'phone'), ''),
            nullif(trim(r -> 'guardian' ->> 'email'), '')
          )
          returning id into v_guardian;
          insert into public.player_guardians (player_id, guardian_id, relationship, is_primary)
          values (
            v_player, v_guardian, coalesce(nullif(r -> 'guardian' ->> 'relationship', ''), 'otro'),
            not exists (select 1 from public.player_guardians x where x.player_id = v_player)
          );
          v_guardians := v_guardians + 1;
        end if;
      end if;

      -- Consentimientos (sólo los que no estén vigentes)
      if jsonb_typeof(r -> 'consents') = 'array' then
        for c in select * from jsonb_array_elements(r -> 'consents') loop
          if exists (
            select 1 from public.consents x
             where x.player_id = v_player and x.consent_type = c ->> 'type' and x.revoked_at is null
          ) then
            continue;
          end if;
          v_date := (c ->> 'date')::date;
          v_minor := private.is_minor(v_player, v_date);
          if v_minor and v_guardian is null then
            select pg.guardian_id into v_guardian
              from public.player_guardians pg
             where pg.player_id = v_player
             order by pg.is_primary desc
             limit 1;
          end if;
          insert into public.consents (player_id, guardian_id, consent_type, document_version, granted_at, notes)
          values (
            v_player,
            case when v_minor then v_guardian else null end,
            c ->> 'type',
            v_version,
            least((v_date::text || ' 12:00:00-03')::timestamptz, now()),
            'Importado desde planilla'
          );
          v_consents := v_consents + 1;
        end loop;
      end if;
    exception when others then
      raise exception 'Fila %: %', v_line, sqlerrm using errcode = sqlstate;
    end;
  end loop;

  return jsonb_build_object(
    'created', v_created, 'updated', v_updated, 'guardians', v_guardians, 'consents', v_consents
  );
end
$$;

revoke execute on function public.import_roster(uuid, jsonb, text) from public, anon;
grant execute on function public.import_roster(uuid, jsonb, text) to authenticated;

comment on function public.import_roster is
  'Importa un plantel (jugadores, categoría de la temporada, DNI, tutor y consentimientos) en una transacción. Sólo admin.';
