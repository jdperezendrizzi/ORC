-- =====================================================================
-- 0005 · Vistas y funciones de análisis.
--
--   v_session_best          mejor valor por sesión × jugador × métrica
--   v_player_season_best    un valor por jugador × métrica × temporada
--   category_benchmarks()   media/desvío/percentiles por categoría, unidad,
--                           línea y puesto (agregado, n ≥ 3)
--   player_comparison()     serie del jugador + z-scores vs. su grupo
--   v_maturation            offset de PHV, edad de PHV y estado madurativo
--   v_player_acwr           carga aguda:crónica (sRPE)
--
-- Las vistas usan security_invoker: respetan el RLS de quien consulta.
-- Los benchmarks se exponen SÓLO agregados mediante una función
-- security definer, para que un profe compare contra todo el club sin
-- ver datos individuales de otras categorías.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Mejor valor por sesión
-- ---------------------------------------------------------------------
create or replace view public.v_session_best
with (security_invoker = true)
as
select
  r.session_id,
  s.session_date,
  s.session_type,
  s.season_id,
  r.player_id,
  r.metric_id,
  m.code                        as metric_code,
  m.unit,
  m.higher_is_better,
  t.id                          as test_type_id,
  t.domain,
  -- Snapshots del momento de la medición
  (array_agg(r.category_id))[1] as category_id,
  (array_agg(r.position_id))[1] as position_id,
  count(*)::int                 as attempts,
  case m.best_of
    when 'max'  then max(r.value)
    when 'min'  then min(r.value)
    when 'avg'  then round(avg(r.value), m.decimals)
    when 'last' then (array_agg(r.value order by r.attempt desc))[1]
  end                           as value,
  max(r.bodyweight_kg)          as bodyweight_kg
from public.results r
join public.evaluation_sessions s on s.id = r.session_id and s.deleted_at is null
join public.test_metrics m on m.id = r.metric_id
join public.test_types t on t.id = m.test_type_id
where r.deleted_at is null
group by r.session_id, s.session_date, s.session_type, s.season_id, r.player_id,
         r.metric_id, m.code, m.unit, m.higher_is_better, m.best_of, m.decimals, t.id, t.domain;

comment on view public.v_session_best is
  'Mejor intento por sesión según best_of. value_per_kg en v_session_best_rel.';

-- Fuerza relativa (kg levantados / kg corporales)
create or replace view public.v_session_best_rel
with (security_invoker = true)
as
select
  b.*,
  case when b.domain = 'strength' and b.unit = 'kg' and b.bodyweight_kg > 0
       then round(b.value / b.bodyweight_kg, 2) end as value_per_kg
from public.v_session_best b;

-- ---------------------------------------------------------------------
-- Un valor por jugador × métrica × temporada (base de los benchmarks)
--   max/min  -> mejor marca de la temporada
--   avg/last -> valor de la última sesión de la temporada
-- La categoría/puesto salen de player_season_categories (fallback: snapshot).
-- ---------------------------------------------------------------------
create or replace view public.v_player_season_best
with (security_invoker = true)
as
with ranked as (
  select
    b.*,
    m.best_of,
    row_number() over (
      partition by b.season_id, b.player_id, b.metric_id
      order by
        case when m.best_of = 'max' then b.value end desc nulls last,
        case when m.best_of = 'min' then b.value end asc nulls last,
        b.session_date desc
    ) as rn
  from public.v_session_best b
  join public.test_metrics m on m.id = b.metric_id
)
select
  r.season_id,
  r.player_id,
  r.metric_id,
  r.metric_code,
  r.higher_is_better,
  r.value,
  r.session_date,
  coalesce(psc.category_id, r.category_id)                      as category_id,
  coalesce(psc.position_id, r.position_id, p.primary_position_id) as position_id
from ranked r
join public.players p on p.id = r.player_id and p.deleted_at is null
left join public.player_season_categories psc
  on psc.player_id = r.player_id and psc.season_id = r.season_id
where r.rn = 1;

-- ---------------------------------------------------------------------
-- Benchmarks agregados (security definer, sólo agregados con n ≥ 3)
--   group_type: 'category' | 'unit' | 'line' | 'position'
--   Las agrupaciones por puesto son DENTRO de la categoría.
-- ---------------------------------------------------------------------
create or replace function public.category_benchmarks(
  p_season_id    uuid,
  p_metric_id    uuid,
  p_category_id  uuid default null
)
returns table (
  season_id    uuid,
  category_id  uuid,
  metric_id    uuid,
  group_type   text,
  group_key    text,
  n            integer,
  mean         numeric,
  sd           numeric,
  p25          numeric,
  p50          numeric,
  p75          numeric,
  min_value    numeric,
  max_value    numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with base as (
    select psb.*, pos.unit::text as unit, pos.line::text as line
    from public.v_player_season_best psb
    left join public.positions pos on pos.id = psb.position_id
    where psb.season_id = p_season_id
      and psb.metric_id = p_metric_id
      and (p_category_id is null or psb.category_id = p_category_id)
      -- Sólo usuarios activos con rol de staff pueden consultar benchmarks.
      and exists (
        select 1 from public.profiles pr
        where pr.id = auth.uid() and pr.active and pr.role in ('admin', 'coach', 'medical')
      )
  ),
  grouped as (
    select
      b.category_id,
      case
        when grouping(b.position_id) = 0 then 'position'
        when grouping(b.line) = 0        then 'line'
        when grouping(b.unit) = 0        then 'unit'
        else 'category'
      end as group_type,
      case
        when grouping(b.position_id) = 0 then b.position_id::text
        when grouping(b.line) = 0        then b.line
        when grouping(b.unit) = 0        then b.unit
        else 'all'
      end                                                    as group_key,
      count(*)::int                                          as n,
      avg(b.value)                                           as mean,
      stddev_samp(b.value)                                   as sd,
      percentile_cont(0.25) within group (order by b.value)  as p25,
      percentile_cont(0.50) within group (order by b.value)  as p50,
      percentile_cont(0.75) within group (order by b.value)  as p75,
      min(b.value)                                           as min_value,
      max(b.value)                                           as max_value
    from base b
    group by grouping sets (
      (b.category_id),
      (b.category_id, b.unit),
      (b.category_id, b.line),
      (b.category_id, b.position_id)
    )
  )
  select
    p_season_id, g.category_id, p_metric_id, g.group_type, g.group_key, g.n,
    round(g.mean, 3), round(g.sd, 3), round(g.p25::numeric, 3), round(g.p50::numeric, 3),
    round(g.p75::numeric, 3), g.min_value, g.max_value
  from grouped g
  where g.n >= 3
    and g.group_key is not null
$$;

comment on function public.category_benchmarks is
  'Benchmarks agregados (n>=3) por categoría/unidad/línea/puesto. No expone datos individuales.';

-- ---------------------------------------------------------------------
-- Comparación de un jugador contra su categoría, unidad (forwards/backs),
-- línea y puesto en el tiempo. Con planteles chicos el puesto rara vez
-- llega a n ≥ 3: la línea es la referencia posicional más útil.
-- z > 0 SIEMPRE significa "mejor que el promedio" (se invierte el signo
-- en métricas donde menos es mejor, p.ej. sprint).
-- security invoker: si el usuario no puede ver al jugador, no devuelve filas.
-- ---------------------------------------------------------------------
create or replace function public.player_comparison(p_player_id uuid, p_metric_id uuid)
returns table (
  session_id        uuid,
  session_date      date,
  season_id         uuid,
  category_id       uuid,
  position_id       smallint,
  value             numeric,
  value_per_kg      numeric,
  category_mean     numeric,
  category_sd       numeric,
  category_n        integer,
  z_category        numeric,
  unit_mean         numeric,
  z_unit            numeric,
  line_mean         numeric,
  z_line            numeric,
  position_mean     numeric,
  position_n        integer,
  z_position        numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with series as (
    select b.*
    from public.v_session_best_rel b
    where b.player_id = p_player_id and b.metric_id = p_metric_id
  ),
  seasons as (
    select distinct s.season_id, s.category_id from series s
  ),
  bench as (
    select cb.*
    from seasons se
    cross join lateral public.category_benchmarks(se.season_id, p_metric_id, se.category_id) cb
  )
  select
    s.session_id, s.session_date, s.season_id, s.category_id, s.position_id,
    s.value, s.value_per_kg,
    bc.mean, bc.sd, bc.n,
    case when bc.sd > 0 then round(
      (s.value - bc.mean) / bc.sd * case when s.higher_is_better then 1 else -1 end, 2) end,
    bu.mean,
    case when bu.sd > 0 then round(
      (s.value - bu.mean) / bu.sd * case when s.higher_is_better then 1 else -1 end, 2) end,
    bl.mean,
    case when bl.sd > 0 then round(
      (s.value - bl.mean) / bl.sd * case when s.higher_is_better then 1 else -1 end, 2) end,
    bp.mean, bp.n,
    case when bp.sd > 0 then round(
      (s.value - bp.mean) / bp.sd * case when s.higher_is_better then 1 else -1 end, 2) end
  from series s
  left join public.positions pos on pos.id = s.position_id
  left join bench bc on bc.season_id = s.season_id and bc.category_id = s.category_id
                    and bc.group_type = 'category'
  left join bench bu on bu.season_id = s.season_id and bu.category_id = s.category_id
                    and bu.group_type = 'unit' and bu.group_key = pos.unit::text
  left join bench bl on bl.season_id = s.season_id and bl.category_id = s.category_id
                    and bl.group_type = 'line' and bl.group_key = pos.line::text
  left join bench bp on bp.season_id = s.season_id and bp.category_id = s.category_id
                    and bp.group_type = 'position' and bp.group_key = s.position_id::text
  order by s.session_date
$$;

-- ---------------------------------------------------------------------
-- Maduración (Mirwald): offset, edad estimada de PHV y estado.
--   pre-PHV  : offset < -1
--   circa-PHV: -1 ≤ offset ≤ 1
--   post-PHV : offset > 1
-- ---------------------------------------------------------------------
create or replace view public.v_maturation
with (security_invoker = true)
as
select
  b.player_id,
  b.session_id,
  b.session_date,
  b.season_id,
  b.category_id,
  private.age_on(p.birth_date, b.session_date)              as age,
  b.value                                                   as maturity_offset,
  round(private.age_on(p.birth_date, b.session_date) - b.value, 2) as age_at_phv,
  case
    when b.value < -1 then 'pre_phv'
    when b.value >  1 then 'post_phv'
    else 'circa_phv'
  end                                                       as maturity_status
from public.v_session_best b
join public.test_metrics m on m.id = b.metric_id and m.derivation = 'mirwald_offset'
join public.players p on p.id = b.player_id;

-- ---------------------------------------------------------------------
-- ACWR por sRPE (promedios móviles: agudo 7 días / crónico 28 días)
-- Una fila por jugador y día desde su primer registro (días sin carga = 0).
-- Zona de referencia habitual: 0.8 – 1.3.
-- ---------------------------------------------------------------------
create or replace view public.v_player_acwr
with (security_invoker = true)
as
with bounds as (
  select player_id, min(log_date) as first_day
  from public.wellness_logs
  where deleted_at is null
  group by player_id
),
days as (
  select b.player_id, d::date as day
  from bounds b
  cross join lateral generate_series(b.first_day, current_date, interval '1 day') d
),
daily as (
  select d.player_id, d.day, coalesce(w.srpe_load, 0) as load
  from days d
  left join public.wellness_logs w
    on w.player_id = d.player_id and w.log_date = d.day and w.deleted_at is null
)
select
  player_id,
  day,
  load,
  round(avg(load) over w7, 1)  as acute_load,
  round(avg(load) over w28, 1) as chronic_load,
  case when avg(load) over w28 > 0
       then round(avg(load) over w7 / avg(load) over w28, 2) end as acwr,
  count(*) over w28 >= 28 as chronic_window_complete
from daily
window
  w7  as (partition by player_id order by day rows between 6 preceding and current row),
  w28 as (partition by player_id order by day rows between 27 preceding and current row);
