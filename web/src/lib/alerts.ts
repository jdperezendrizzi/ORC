// Alertas automáticas y datos del resumen semanal (funciones puras: se
// testean sin base). No usan IA: son reglas simples y explicables.

import type { DashMetric, DashPoint } from "./dashboard";
import { formatValue } from "./validation";
import { ABSENCE_STREAK, absenceStreak, attendancePct, type AttendanceRow } from "./attendance";

// ---------------------------------------------------------------------
// Reglas (umbrales a la vista para poder explicarlos y ajustarlos)
// ---------------------------------------------------------------------

/** Bienestar ≤ 12/25 (promedio < 2,5 de 5) en los últimos 3 registros. */
export const WELLNESS_LOW_MAX = 12;
export const WELLNESS_STREAK = 3;
/** Carga de la última semana ≥ 1,5 veces el promedio de las últimas 4. */
export const ACWR_HIGH = 1.5;
/** Días de registros necesarios para comparar contra "lo habitual". */
export const ACWR_MIN_HISTORY_DAYS = 21;
/** Caída de rendimiento: 3 % en tiempos (sprint, agilidad), 5 % en el resto. */
export const DROP_PCT_TIME = 3;
export const DROP_PCT_OTHER = 5;
/** Sólo se avisa si la última medición es reciente. */
export const DROP_RECENT_DAYS = 45;

/** Tests físicos que se siguen (no antropometría, partido ni GPS). */
export const TRACKED_METRICS = new Set([
  "back_squat_1rm_kg",
  "bench_press_1rm_kg",
  "deadlift_1rm_kg",
  "pull_ups_reps",
  "sprint_10m_s",
  "sprint_20m_s",
  "sprint_40m_s",
  "cmj_height_cm",
  "agility_505_left_s",
  "agility_505_right_s",
  "t_test_s",
  "reaction_time_ms",
  "yoyo_ir1_distance_m",
  "ift_vift_kmh",
]);

// ---------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------

export type AlertKind = "injury_overdue" | "load_spike" | "wellness_low" | "absences" | "perf_drop";
export type Severity = "alta" | "media";

export interface Alert {
  kind: AlertKind;
  severity: Severity;
  playerId: string;
  categoryId: string;
  /** Texto sin nombres (se puede mandar a la IA). */
  detail: string;
  href: string;
}

export interface AlertPlayer {
  id: string;
  name: string;
  categoryId: string;
}

export interface WellnessPoint {
  player_id: string;
  log_date: string;
  wellness_score: number | null;
  srpe_load: number | null;
}

export interface InjuryPoint {
  id: string;
  player_id: string;
  status: string;
  occurred_on: string;
  expected_return: string | null;
  actual_return: string | null;
}

export interface AlertInput {
  today: string;
  players: AlertPlayer[];
  metrics: DashMetric[];
  points: DashPoint[];
  wellness: WellnessPoint[];
  injuries: InjuryPoint[];
  /** Asistencia reciente (opcional: sin ella no hay alerta de faltas). */
  attendance?: AttendanceRow[];
}

export const alertKindLabel: Record<AlertKind, string> = {
  injury_overdue: "Regreso vencido",
  load_spike: "Carga en alza",
  wellness_low: "Bienestar bajo",
  absences: "Faltas seguidas",
  perf_drop: "Bajó el rendimiento",
};

// ---------------------------------------------------------------------
// Fechas (YYYY-MM-DD, sin zona horaria)
// ---------------------------------------------------------------------

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b.slice(0, 10)}T12:00:00Z`) - Date.parse(`${a.slice(0, 10)}T12:00:00Z`)) / 864e5);

/** Lunes de la semana de `iso`. */
export function weekStart(iso: string): string {
  const dow = new Date(`${iso.slice(0, 10)}T12:00:00Z`).getUTCDay(); // 0 = domingo
  return addDays(iso, -((dow + 6) % 7));
}

const shortDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("es-AR", { day: "numeric", month: "short" });

const pctText = (pct: number) => `${pct > 0 ? "+" : "−"}${formatValue(Math.abs(pct), 0)} %`;

// ---------------------------------------------------------------------
// Cálculos
// ---------------------------------------------------------------------

/** Carga aguda (7 días) / crónica (28 días) al día `today`, o null si falta historia. */
export function acwr(logs: WellnessPoint[], today: string): { ratio: number; acute: number; chronic: number } | null {
  const dated = logs.filter((l) => l.log_date <= today);
  if (dated.length === 0) return null;
  const first = dated.reduce((m, l) => (l.log_date < m ? l.log_date : m), today);
  if (daysBetween(first, today) < ACWR_MIN_HISTORY_DAYS) return null;
  let acute = 0;
  let chronic = 0;
  for (const l of dated) {
    const ago = daysBetween(l.log_date, today);
    const load = l.srpe_load ?? 0;
    if (ago < 7) acute += load;
    if (ago < 28) chronic += load;
  }
  acute /= 7;
  chronic /= 28;
  if (chronic <= 0) return null;
  return { ratio: acute / chronic, acute, chronic };
}

/** Cambio de la última medición respecto de la anterior (en %, con signo). */
export function lastChange(points: DashPoint[]): { from: number; to: number; date: string; prevDate: string; pct: number } | null {
  const byDate = [...points].sort((a, b) => a[2].localeCompare(b[2]));
  if (byDate.length < 2) return null;
  const last = byDate[byDate.length - 1];
  const prev = [...byDate].reverse().find((p) => p[2] < last[2]);
  if (!prev || prev[3] === 0) return null;
  return { from: prev[3], to: last[3], date: last[2], prevDate: prev[2], pct: ((last[3] - prev[3]) / Math.abs(prev[3])) * 100 };
}

const dropThreshold = (m: DashMetric) => (m.unit === "s" ? DROP_PCT_TIME : DROP_PCT_OTHER);

function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = m.get(k);
    if (list) list.push(r);
    else m.set(k, [r]);
  }
  return m;
}

const SEVERITY_ORDER: Record<Severity, number> = { alta: 0, media: 1 };
const KIND_ORDER: Record<AlertKind, number> = { injury_overdue: 0, load_spike: 1, wellness_low: 2, absences: 3, perf_drop: 4 };

export function computeAlerts(input: AlertInput): Alert[] {
  const { today } = input;
  const players = new Map(input.players.map((p) => [p.id, p]));
  const alerts: Alert[] = [];
  const push = (a: Omit<Alert, "categoryId">) => {
    const p = players.get(a.playerId);
    if (p) alerts.push({ ...a, categoryId: p.categoryId });
  };

  // 1. Lesión con regreso estimado vencido
  for (const i of input.injuries) {
    if (i.status !== "closed" && i.expected_return && i.expected_return < today) {
      push({
        kind: "injury_overdue",
        severity: "alta",
        playerId: i.player_id,
        detail: `Regreso estimado ${shortDate(i.expected_return)} (hace ${daysBetween(i.expected_return, today)} días): actualizar el seguimiento.`,
        href: `/lesiones/${i.id}`,
      });
    }
  }

  // 2 y 3. Bienestar y carga
  const byPlayer = groupBy(input.wellness, (w) => w.player_id);
  for (const [playerId, logs] of byPlayer) {
    const scored = logs
      .filter((l) => l.wellness_score !== null && l.log_date <= today)
      .sort((a, b) => b.log_date.localeCompare(a.log_date))
      .slice(0, WELLNESS_STREAK);
    if (
      scored.length === WELLNESS_STREAK &&
      daysBetween(scored[0].log_date, today) <= 7 &&
      daysBetween(scored[WELLNESS_STREAK - 1].log_date, scored[0].log_date) <= 10 &&
      scored.every((l) => (l.wellness_score as number) <= WELLNESS_LOW_MAX)
    ) {
      push({
        kind: "wellness_low",
        severity: "media",
        playerId,
        detail: `Bienestar ${scored.map((l) => l.wellness_score).reverse().join(", ")} /25 en los últimos ${WELLNESS_STREAK} registros. Charlarlo antes de entrenar.`,
        href: `/jugadores/${playerId}`,
      });
    }
    const load = acwr(logs, today);
    if (load && load.ratio >= ACWR_HIGH) {
      push({
        kind: "load_spike",
        severity: "alta",
        playerId,
        detail: `Carga de los últimos 7 días ${formatValue(load.ratio, 1)} veces su promedio del mes. Más riesgo de lesión: dosificar.`,
        href: `/jugadores/${playerId}`,
      });
    }
  }

  // 4. Faltas seguidas sin justificar a prácticas (de la categoría actual)
  const attByPlayer = groupBy(
    (input.attendance ?? []).filter((a) => players.get(a.player_id)?.categoryId === a.category_id && a.att_date <= today),
    (a) => a.player_id,
  );
  for (const [playerId, rows] of attByPlayer) {
    const st = absenceStreak(rows);
    if (st.count >= ABSENCE_STREAK && daysBetween(st.dates[0], today) <= 14) {
      push({
        kind: "absences",
        severity: "media",
        playerId,
        detail: `Faltó a las últimas ${st.count} prácticas sin justificar (${st.dates.slice(0, 3).reverse().map(shortDate).join(", ")}). Averiguar qué pasa.`,
        href: `/jugadores/${playerId}`,
      });
    }
  }

  // 5. Caída de rendimiento en tests físicos
  const tracked = input.metrics.filter((m) => TRACKED_METRICS.has(m.code));
  const metricById = new Map(tracked.map((m) => [m.id, m]));
  const series = groupBy(
    input.points.filter((p) => metricById.has(p[1]) && players.has(p[0])),
    (p) => `${p[0]}|${p[1]}`,
  );
  for (const [key, pts] of series) {
    const [playerId, metricId] = key.split("|");
    const m = metricById.get(metricId)!;
    const ch = lastChange(pts);
    if (!ch || daysBetween(ch.date, today) > DROP_RECENT_DAYS) continue;
    const worse = m.higherIsBetter ? -ch.pct : ch.pct;
    if (worse >= dropThreshold(m)) {
      push({
        kind: "perf_drop",
        severity: "media",
        playerId,
        detail: `${m.name}: ${formatValue(ch.from, m.decimals)} → ${formatValue(ch.to, m.decimals)} ${m.unit} (${pctText(ch.pct)}) respecto de la medición anterior.`,
        href: `/jugadores/${playerId}`,
      });
    }
  }

  return alerts.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      (players.get(a.playerId)?.name ?? "").localeCompare(players.get(b.playerId)?.name ?? ""),
  );
}

// ---------------------------------------------------------------------
// Resumen semanal: hechos SIN nombres (códigos J1, J2…)
// ---------------------------------------------------------------------

export interface WeeklyFacts {
  categoria: string;
  desde: string;
  hasta: string;
  jugadores: number;
  bienestar: {
    registros: number;
    jugadores_con_registro: number;
    promedio: number | null; // /25
    promedio_semana_anterior: number | null;
    carga_promedio: number | null; // sRPE por registro
    carga_promedio_semana_anterior: number | null;
  };
  asistencia: { practicas: number; partidos: number; promedio_pct: number | null; semana_anterior_pct: number | null };
  evaluaciones: { fecha: string; titulo: string }[];
  mejoras: { jugador: string; detalle: string }[];
  lesiones: { activas: number; nuevas: number; altas: number; regreso_vencido: number };
  alertas: { jugador: string; tipo: string; detalle: string }[];
}

export interface WeeklyInput extends AlertInput {
  categoryName: string;
  sessions: { session_date: string; title: string | null; session_type: string }[];
}

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);

/** Hechos de los últimos 7 días (hasta `today` inclusive) y códigos de jugador. */
export function weeklyFacts(input: WeeklyInput, sessionLabel: (type: string) => string = (t) => t): { facts: WeeklyFacts; codes: Record<string, string> } {
  const { today } = input;
  const from = addDays(today, -6);
  const prevFrom = addDays(today, -13);
  const prevTo = addDays(today, -7);
  const ids = new Set(input.players.map((p) => p.id));

  // Códigos estables dentro del resumen: por orden alfabético.
  const sorted = [...input.players].sort((a, b) => a.name.localeCompare(b.name));
  const codeOf = new Map(sorted.map((p, i) => [p.id, `J${i + 1}`]));
  const used = new Set<string>();
  const code = (playerId: string) => {
    used.add(playerId);
    return codeOf.get(playerId) ?? "J?";
  };

  const inRange = (d: string, a: string, b: string) => d >= a && d <= b;
  const wk = input.wellness.filter((w) => ids.has(w.player_id) && inRange(w.log_date, from, today));
  const prev = input.wellness.filter((w) => ids.has(w.player_id) && inRange(w.log_date, prevFrom, prevTo));
  const scores = (rows: WellnessPoint[]) => rows.map((r) => r.wellness_score).filter((x): x is number => x !== null);
  const loads = (rows: WellnessPoint[]) => rows.map((r) => r.srpe_load).filter((x): x is number => x !== null);

  // Mejoras de la semana en tests físicos (las caídas van como alertas)
  const tracked = new Map(input.metrics.filter((m) => TRACKED_METRICS.has(m.code)).map((m) => [m.id, m]));
  const series = groupBy(
    input.points.filter((p) => ids.has(p[0]) && tracked.has(p[1])),
    (p) => `${p[0]}|${p[1]}`,
  );
  const improvements: { playerId: string; m: DashMetric; pct: number; from: number; to: number }[] = [];
  for (const [key, pts] of series) {
    const ch = lastChange(pts);
    if (!ch || !inRange(ch.date, from, today)) continue;
    const [playerId, metricId] = key.split("|");
    const m = tracked.get(metricId)!;
    const better = m.higherIsBetter ? ch.pct : -ch.pct;
    if (better >= dropThreshold(m)) improvements.push({ playerId, m, pct: ch.pct, from: ch.from, to: ch.to });
  }
  improvements.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));

  const inj = input.injuries.filter((i) => ids.has(i.player_id));
  const alerts = computeAlerts({ ...input, players: input.players });

  const facts: WeeklyFacts = {
    categoria: input.categoryName,
    desde: from,
    hasta: today,
    jugadores: input.players.length,
    bienestar: {
      registros: wk.length,
      jugadores_con_registro: new Set(wk.map((w) => w.player_id)).size,
      promedio: avg(scores(wk)),
      promedio_semana_anterior: avg(scores(prev)),
      carga_promedio: avg(loads(wk)),
      carga_promedio_semana_anterior: avg(loads(prev)),
    },
    asistencia: (() => {
      const att = (input.attendance ?? []).filter((a) => ids.has(a.player_id));
      const wkA = att.filter((a) => inRange(a.att_date, from, today));
      const prevA = att.filter((a) => inRange(a.att_date, prevFrom, prevTo));
      const days = (rows: AttendanceRow[], k: string) => new Set(rows.filter((r) => r.kind === k).map((r) => `${r.category_id}|${r.att_date}`)).size;
      return {
        practicas: days(wkA, "practice"),
        partidos: days(wkA, "match"),
        promedio_pct: attendancePct(wkA),
        semana_anterior_pct: attendancePct(prevA),
      };
    })(),
    evaluaciones: input.sessions
      .filter((s) => inRange(s.session_date, from, today))
      .sort((a, b) => a.session_date.localeCompare(b.session_date))
      .map((s) => ({ fecha: s.session_date, titulo: s.title ?? sessionLabel(s.session_type) })),
    mejoras: improvements.slice(0, 5).map((i) => ({
      jugador: code(i.playerId),
      detalle: `${i.m.name}: ${formatValue(i.from, i.m.decimals)} → ${formatValue(i.to, i.m.decimals)} ${i.m.unit} (${pctText(i.pct)})`,
    })),
    lesiones: {
      activas: inj.filter((i) => i.status !== "closed").length,
      nuevas: inj.filter((i) => inRange(i.occurred_on, from, today)).length,
      altas: inj.filter((i) => i.status === "closed" && i.actual_return && inRange(i.actual_return, from, today)).length,
      regreso_vencido: alerts.filter((a) => a.kind === "injury_overdue").length,
    },
    alertas: alerts
      .filter((a) => a.kind !== "injury_overdue")
      .slice(0, 12)
      .map((a) => ({ jugador: code(a.playerId), tipo: alertKindLabel[a.kind], detalle: a.detail })),
  };

  const codes: Record<string, string> = {};
  for (const id of used) codes[codeOf.get(id)!] = id;
  return { facts, codes };
}

// ---------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------

const n = (x: number | null, d = 1) => (x === null ? "—" : formatValue(x, d));

/** Resumen sin IA (siempre disponible; también es el respaldo si la IA falla). */
export function templateSummary(f: WeeklyFacts): string {
  const lines: string[] = [];
  const w = f.bienestar;
  lines.push(`${f.categoria}, semana del ${shortDate(f.desde)} al ${shortDate(f.hasta)}.`);
  if (w.registros > 0) {
    const trend =
      w.promedio !== null && w.promedio_semana_anterior !== null
        ? w.promedio > w.promedio_semana_anterior
          ? " (mejor que la semana anterior)"
          : w.promedio < w.promedio_semana_anterior
            ? " (peor que la semana anterior)"
            : " (igual que la semana anterior)"
        : "";
    lines.push(
      `Bienestar: ${w.registros} registros de ${w.jugadores_con_registro} de ${f.jugadores} jugadores, promedio ${n(w.promedio)}/25${trend}.`,
    );
    if (w.carga_promedio !== null) {
      lines.push(`Carga promedio por sesión: ${n(w.carga_promedio, 0)} (semana anterior: ${n(w.carga_promedio_semana_anterior, 0)}).`);
    }
  } else {
    lines.push("Bienestar: no hubo registros esta semana.");
  }
  const a = f.asistencia;
  if (a && a.practicas + a.partidos > 0) {
    lines.push(
      `Asistencia: ${a.promedio_pct ?? "—"} % en ${a.practicas} ${a.practicas === 1 ? "práctica" : "prácticas"}${a.partidos ? ` y ${a.partidos} ${a.partidos === 1 ? "partido" : "partidos"}` : ""}${a.semana_anterior_pct !== null ? ` (semana anterior: ${a.semana_anterior_pct} %)` : ""}.`,
    );
  } else if (a) {
    lines.push("Asistencia: no se tomó esta semana.");
  }
  if (f.evaluaciones.length) lines.push(`Evaluaciones: ${f.evaluaciones.map((e) => `${e.titulo} (${shortDate(e.fecha)})`).join(", ")}.`);
  if (f.mejoras.length) lines.push(`Mejoras: ${f.mejoras.map((m) => `${m.jugador} en ${m.detalle}`).join("; ")}.`);
  const l = f.lesiones;
  lines.push(
    `Lesiones: ${l.activas} activas, ${l.nuevas} nuevas, ${l.altas} altas${l.regreso_vencido ? `, ${l.regreso_vencido} con regreso estimado vencido` : ""}.`,
  );
  if (f.alertas.length) {
    lines.push("A tener en cuenta:");
    for (const a of f.alertas) lines.push(`- ${a.jugador} · ${a.tipo}: ${a.detalle}`);
  } else {
    lines.push("Sin alertas de bienestar, carga ni rendimiento.");
  }
  return lines.join("\n");
}

/** Reemplaza los códigos J1… por nombres (los que el usuario puede ver). */
export function withNames(text: string, codes: Record<string, string>, names: Map<string, string>): string {
  return text.replace(/\bJ(\d+)\b/g, (code) => {
    const id = codes[code];
    return (id && names.get(id)) || "un jugador";
  });
}
