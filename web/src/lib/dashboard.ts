// Cálculos del panel del equipo (funciones puras: se testean sin base).

export interface DashPlayer {
  id: string;
  name: string; // "Apellido, Nombre"
  categoryId: string;
  unit: "forwards" | "backs" | null;
  position: string | null; // sigla
}

export interface DashMetric {
  id: string;
  code: string;
  name: string;
  unit: string;
  decimals: number;
  higherIsBetter: boolean;
  domain: string;
}

/** Mejor valor de un jugador en una sesión: [playerId, metricId, fecha, valor]. */
export type DashPoint = [string, string, string, number];

export interface DashboardData {
  categories: { id: string; name: string }[];
  players: DashPlayer[];
  metrics: DashMetric[];
  points: DashPoint[];
}

export type Group = "all" | "forwards" | "backs";

export const inGroup = (p: DashPlayer, g: Group) => g === "all" || p.unit === g;

/**
 * Valor de la temporada por jugador: la mejor marca; en antropometría, la
 * última (no hay "mejor" peso).
 */
export function seasonValue(points: DashPoint[], metric: DashMetric, playerId: string): { value: number; date: string } | null {
  let best: { value: number; date: string } | null = null;
  for (const [p, m, d, v] of points) {
    if (p !== playerId || m !== metric.id) continue;
    if (!best) best = { value: v, date: d };
    else if (metric.domain === "anthropometry") {
      if (d > best.date) best = { value: v, date: d };
    } else if (metric.higherIsBetter ? v > best.value : v < best.value) best = { value: v, date: d };
  }
  return best;
}

export interface RankingRow {
  player: DashPlayer;
  value: number;
  date: string;
}

/** Ranking de la métrica (mejor primero). */
export function ranking(data: DashboardData, metric: DashMetric, players: DashPlayer[]): RankingRow[] {
  const rows: RankingRow[] = [];
  for (const player of players) {
    const v = seasonValue(data.points, metric, player.id);
    if (v) rows.push({ player, ...v });
  }
  return rows.sort((a, b) => (metric.higherIsBetter ? b.value - a.value : a.value - b.value));
}

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export interface EvolutionRow {
  date: string;
  forwards: number | null;
  backs: number | null;
  all: number | null;
  n: number;
}

/** Promedio por fecha de testeo, para forwards, backs y todos. */
export function teamEvolution(data: DashboardData, metric: DashMetric, players: DashPlayer[]): EvolutionRow[] {
  const byId = new Map(players.map((p) => [p.id, p]));
  const byDate = new Map<string, { f: number[]; b: number[]; a: number[] }>();
  for (const [p, m, d, v] of data.points) {
    if (m !== metric.id) continue;
    const player = byId.get(p);
    if (!player) continue;
    const bucket = byDate.get(d) ?? { f: [], b: [], a: [] };
    bucket.a.push(v);
    if (player.unit === "forwards") bucket.f.push(v);
    if (player.unit === "backs") bucket.b.push(v);
    byDate.set(d, bucket);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, x]) => ({ date, forwards: mean(x.f), backs: mean(x.b), all: mean(x.a), n: x.a.length }));
}

export interface Highlight {
  value: number | null;
  previous: number | null;
  /** Diferencia con signo (actual − anterior). */
  delta: number | null;
  improved: boolean | null;
  n: number;
  date: string | null;
}

/** Promedio del grupo en el último testeo y comparación con el anterior. */
export function highlight(data: DashboardData, metric: DashMetric | undefined, players: DashPlayer[]): Highlight {
  const empty: Highlight = { value: null, previous: null, delta: null, improved: null, n: 0, date: null };
  if (!metric) return empty;
  const evo = teamEvolution(data, metric, players).filter((r) => r.all !== null);
  if (evo.length === 0) return empty;
  const last = evo[evo.length - 1];
  const prev = evo.length > 1 ? evo[evo.length - 2] : null;
  const delta = prev && last.all !== null && prev.all !== null ? last.all - prev.all : null;
  return {
    value: last.all,
    previous: prev?.all ?? null,
    delta,
    improved: delta === null || delta === 0 ? null : delta > 0 === metric.higherIsBetter,
    n: last.n,
    date: last.date,
  };
}

/** Métricas con datos para los jugadores dados. */
export function metricsWithData(data: DashboardData, players: DashPlayer[]): DashMetric[] {
  const ids = new Set(players.map((p) => p.id));
  const used = new Set<string>();
  for (const [p, m] of data.points) if (ids.has(p)) used.add(m);
  return data.metrics.filter((m) => used.has(m.id));
}
