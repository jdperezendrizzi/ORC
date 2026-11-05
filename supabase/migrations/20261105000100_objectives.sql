-- =====================================================================
-- Objetivos por categoría (checklist).
--
--   objectives        los carga el admin: objetivo, qué mirar y ejercicio.
--                     scope 'team' (M6/M7: objetivos generales del equipo)
--                     o 'player' (para usar más adelante, por jugador).
--   objective_checks  el profe tacha en cada práctica. Una fila por
--                     objetivo × día (× jugador si es por jugador): queda
--                     la evolución en la temporada. Id generado en el
--                     celular (carga sin señal, upsert idempotente).
--
-- Los objetivos del equipo no son datos personales: no piden
-- consentimiento. Los de jugador exigen el de datos de rendimiento.
-- =====================================================================

-- Categorías infantiles que faltaban (M6 a M11 y M13)
insert into public.categories (code, name, level, max_age, sort_order) values
  ('M6',  'Menores de 6',  'infantiles', 6,  4),
  ('M7',  'Menores de 7',  'infantiles', 7,  5),
  ('M8',  'Menores de 8',  'infantiles', 8,  6),
  ('M9',  'Menores de 9',  'infantiles', 9,  7),
  ('M10', 'Menores de 10', 'infantiles', 10, 8),
  ('M11', 'Menores de 11', 'infantiles', 11, 9),
  ('M13', 'Menores de 13', 'infantiles', 13, 15)
on conflict (code) do nothing;

create type public.objective_scope as enum ('team', 'player');
create type public.objective_area as enum ('game', 'contact', 'attitude', 'other');

create table public.objectives (
  id                    uuid primary key default gen_random_uuid(),
  category_id           uuid not null references public.categories (id) on delete cascade,
  scope                 public.objective_scope not null default 'team',
  area                  public.objective_area not null default 'game',
  title                 text not null check (char_length(title) between 3 and 160),
  look_for              text check (char_length(look_for) <= 1000),
  exercise_name         text check (char_length(exercise_name) <= 120),
  exercise_description  text check (char_length(exercise_description) <= 2000),
  exercise_url          text check (exercise_url ~ '^https?://' and char_length(exercise_url) <= 500),
  sort_order            smallint not null default 0,
  active                boolean not null default true,
  created_by            uuid references public.profiles (id) default auth.uid(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index objectives_category_idx on public.objectives (category_id, sort_order) where active;

create trigger objectives_updated_at before update on public.objectives
  for each row execute function private.set_updated_at();

create table public.objective_checks (
  id            uuid primary key,                       -- lo genera el celular
  objective_id  uuid not null references public.objectives (id) on delete cascade,
  season_id     uuid not null references public.seasons (id),
  check_date    date not null,
  player_id     uuid references public.players (id) on delete cascade,  -- null = equipo
  achieved      boolean not null,
  note          text check (char_length(note) <= 300),
  checked_by    uuid references public.profiles (id) default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index objective_checks_one_per_day_idx
  on public.objective_checks (objective_id, check_date, player_id) nulls not distinct;
create index objective_checks_season_idx on public.objective_checks (season_id, objective_id, check_date);

create or replace function private.objective_checks_before()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scope public.objective_scope;
begin
  select scope into v_scope from public.objectives where id = new.objective_id;
  if v_scope = 'team' and new.player_id is not null then
    raise exception 'Este objetivo es del equipo: no lleva jugador.' using errcode = '23514';
  end if;
  if v_scope = 'player' then
    if new.player_id is null then
      raise exception 'Este objetivo es por jugador: falta el jugador.' using errcode = '23514';
    end if;
    perform private.assert_consent(new.player_id, 'performance_data');
  end if;
  -- Margen de un día por la zona horaria (Argentina vs. UTC).
  if new.check_date > current_date + 1 then
    raise exception 'La fecha de la práctica no puede ser futura.' using errcode = '23514';
  end if;
  new.checked_by := auth.uid();
  if tg_op = 'UPDATE' then
    new.objective_id := old.objective_id;
    new.player_id    := old.player_id;
    new.check_date   := old.check_date;
    new.season_id    := old.season_id;
    new.created_at   := old.created_at;
    new.updated_at   := now();
  end if;
  return new;
end
$$;
revoke all on function private.objective_checks_before() from public, anon, authenticated;

create trigger objective_checks_before
  before insert or update on public.objective_checks
  for each row execute function private.objective_checks_before();

create trigger audit_objectives after insert or update or delete on public.objectives
  for each row execute function private.audit_trigger();
create trigger audit_objective_checks after insert or update or delete on public.objective_checks
  for each row execute function private.audit_trigger();

-- ---------------------------------------------------------------------
-- RLS: el admin carga los objetivos y ve todo. El profe ve los de sus
-- categorías y marca el checklist sólo ahí. (El área médica no lo usa.)
-- ---------------------------------------------------------------------
alter table public.objectives enable row level security;
alter table public.objective_checks enable row level security;

create or replace function private.my_objective_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select o.id from public.objectives o
  where private.is_admin()
     or o.category_id in (select private.my_category_ids())
$$;
revoke all on function private.my_objective_ids() from public, anon;
grant execute on function private.my_objective_ids() to authenticated;

create policy objectives_select on public.objectives for select to authenticated
  using ((select private.is_admin()) or category_id in (select private.my_category_ids()));
create policy objectives_admin_insert on public.objectives for insert to authenticated
  with check ((select private.is_admin()));
create policy objectives_admin_update on public.objectives for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy objectives_admin_delete on public.objectives for delete to authenticated
  using ((select private.is_admin()));

create policy objective_checks_select on public.objective_checks for select to authenticated
  using (objective_id in (select private.my_objective_ids()));
create policy objective_checks_insert on public.objective_checks for insert to authenticated
  with check (objective_id in (select private.my_objective_ids()));
create policy objective_checks_update on public.objective_checks for update to authenticated
  using (objective_id in (select private.my_objective_ids()))
  with check (objective_id in (select private.my_objective_ids()));
create policy objective_checks_admin_delete on public.objective_checks for delete to authenticated
  using ((select private.is_admin()));

revoke all on public.objectives, public.objective_checks from anon;
grant select, insert, update, delete on public.objectives to authenticated;
grant select, insert, update, delete on public.objective_checks to authenticated;

-- ---------------------------------------------------------------------
-- Borrador para M6 y M7 (para corregir o borrar desde Admin → Objetivos)
-- ---------------------------------------------------------------------
insert into public.objectives (category_id, scope, area, title, look_for, exercise_name, exercise_description, sort_order)
select c.id, 'team', v.area::public.objective_area, v.title, v.look_for, v.ex_name, v.ex_desc, v.ord
from public.categories c
join (values
  ('M6', 'game', 'El equipo va para adelante con la pelota',
   'Al recibir, corren hacia el ingoal rival y no hacia los costados ni para atrás.',
   'Carrera al ingoal',
   'Borrador: en grupos de 4, cada uno con pelota, salen al silbato y apoyan en el ingoal de enfrente. Después con un "defensor" que sólo toca con las dos manos.', 1),
  ('M6', 'game', 'Apoyan la pelota en el ingoal',
   'Apoyan con las manos y la pelota contra el piso, sin tirarla.',
   'Try en la línea',
   'Borrador: postas cortas que terminan en el ingoal; gana el equipo que apoya bien todos los tries.', 2),
  ('M6', 'game', 'Pasan la pelota para atrás',
   'El pase sale hacia un compañero que está atrás o en línea, no adelante.',
   'Pasala para atrás',
   'Borrador: en filas de 3 caminando y después trotando, se pasan la pelota hacia atrás hasta el ingoal.', 3),
  ('M6', 'attitude', 'Juegan todos y se divierten',
   'Todos tocan la pelota en el juego; nadie queda afuera mirando.',
   'Juego reducido',
   'Borrador: partidos de 4 contra 4 en cancha chica, rotando seguido para que todos participen.', 4),
  ('M6', 'attitude', 'Respetan al compañero, al rival y al referí',
   'Aceptan las decisiones, saludan al terminar y no se burlan.',
   null, 'Borrador: cierre de cada práctica con el saludo de los dos equipos.', 5),
  ('M7', 'game', 'El equipo va para adelante con la pelota',
   'El portador busca avanzar y los compañeros lo acompañan, no se quedan parados.',
   'Avance con apoyo',
   'Borrador: 3 contra 1 en un pasillo; el portador avanza y los de apoyo corren atrás listos para recibir.', 1),
  ('M7', 'game', 'Acompañan al que lleva la pelota',
   'Hay al menos un compañero cerca y atrás del portador para recibir el pase.',
   'Apoyo al portador',
   'Borrador: juego de toque donde el try sólo vale si hubo al menos un pase de un compañero de apoyo.', 2),
  ('M7', 'contact', 'Inicio al tackle: tacklean abajo y abrazan las piernas',
   'Bajan, ponen la cabeza al costado (nunca adelante), usan el hombro y abrazan las piernas.',
   'Tackle de rodillas',
   'Borrador: siguiendo la progresión de tackle del club, de rodillas sobre colchoneta y a un escudo; recién después caminando.', 3),
  ('M7', 'contact', 'Caen seguros cuando los tacklean',
   'Al caer protegen la pelota y se apoyan sin estirar los brazos de golpe.',
   'Caídas seguras',
   'Borrador: caídas desde rodillas y desde parados sobre colchoneta, abrazando la pelota.', 4),
  ('M7', 'attitude', 'Se levantan rápido y vuelven a jugar',
   'Después de un contacto se paran enseguida y se suman al juego.',
   null, 'Borrador: en los juegos de contacto, el que cae tiene que volver a su lugar antes de la próxima jugada.', 5)
) as v(code, area, title, look_for, ex_name, ex_desc, ord) on v.code = c.code
where not exists (select 1 from public.objectives o where o.category_id = c.id);
