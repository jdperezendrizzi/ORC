// Resumen de asistencia de un período (funciones puras: se testean sin base).

import { addDays, weekStart } from "./alerts";
import { attendancePct, countByStatus, type AttendanceKind, type AttendanceRow } from "./attendance";

export type KindFilter = "all" | AttendanceKind;
export type Preset = "mes" | "mes-anterior" | "temporada" | "rango";

export interface PlayerSummary {
  id: string;
  name: string;
  present: number;
  absent: number;
  excused: number;
  pct: number | null;
  practicePct: number | null;
  matchPct: number | null;
}

export interface WeekSummary {
  weekStart: string;
  practices: number;
  matches: number;
  pct: number | null;
  practicePct: number | null;
  matchPct: number | null;
  excused: number;
}

export interface WeekdaySummary {
  dow: number; // 0 = domingo
  label: string;
  sessions: number;
  pct: number | null;
}

export interface AttendanceReport {
  from: string;
  to: string;
  practices: number;
  matches: number;
  avgPct: number | null;
  practicePct: number | null;
  matchPct: number | null;
  players: PlayerSummary[]; // de menor a mayor asistencia (sin datos al final)
  weeks: WeekSummary[];
  practiceDays: WeekdaySummary[]; // asistencia a prácticas por día de la semana
  low: PlayerSummary[]; // debajo de LOW_PCT
}

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const dowOf = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
const ofKind = (list: AttendanceRow[], k: AttendanceKind) => list.filter((r) => r.kind === k);

export const LOW_PCT = 60;

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const lastDayOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);

/** Período a partir de un atajo ("este mes", "mes anterior", "temporada" o un rango). */
export function periodFor(
  preset: Preset,
  today: string,
  season: { starts_on: string; ends_on: string },
  range?: { from?: string; to?: string },
): { from: string; to: string; label: string } {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7)) - 1;
  if (preset === "mes") return { from: `${today.slice(0, 7)}-01`, to: today, label: `${MONTHS[m]} ${y}` };
  if (preset === "mes-anterior") {
    const py = m === 0 ? y - 1 : y;
    const pm = m === 0 ? 11 : m - 1;
    const mm = String(pm + 1).padStart(2, "0");
    return { from: `${py}-${mm}-01`, to: lastDayOfMonth(py, pm), label: `${MONTHS[pm]} ${py}` };
  }
  if (preset === "temporada") {
    const to = season.ends_on < today ? season.ends_on : today;
    return { from: season.starts_on, to, label: "toda la temporada" };
  }
  const valid = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const from = valid(range?.from) ? range!.from! : `${today.slice(0, 7)}-01`;
  const to = valid(range?.to) && range!.to! >= from ? range!.to! : today;
  const fmt = (d: string) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;
  return { from, to, label: `del ${fmt(from)} al ${fmt(to)}` };
}

export function buildAttendanceReport(
  rows: AttendanceRow[],
  players: { id: string; name: string }[],
  opts: { from: string; to: string; kind: KindFilter },
): AttendanceReport {
  const ids = new Set(players.map((p) => p.id));
  const inPeriod = rows.filter(
    (r) => ids.has(r.player_id) && r.att_date >= opts.from && r.att_date <= opts.to && (opts.kind === "all" || r.kind === opts.kind),
  );
  const days = (k: AttendanceKind, list: AttendanceRow[]) => new Set(list.filter((r) => r.kind === k).map((r) => r.att_date)).size;

  const byPlayer = new Map<string, AttendanceRow[]>();
  for (const r of inPeriod) byPlayer.set(r.player_id, [...(byPlayer.get(r.player_id) ?? []), r]);
  const summaries: PlayerSummary[] = players.map((p) => {
    const list = byPlayer.get(p.id) ?? [];
    return {
      id: p.id,
      name: p.name,
      ...countByStatus(list),
      pct: attendancePct(list),
      practicePct: attendancePct(ofKind(list, "practice")),
      matchPct: attendancePct(ofKind(list, "match")),
    };
  });
  summaries.sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101) || a.name.localeCompare(b.name));

  const byWeek = new Map<string, AttendanceRow[]>();
  for (const r of inPeriod) {
    const w = weekStart(r.att_date);
    byWeek.set(w, [...(byWeek.get(w) ?? []), r]);
  }
  const weeks: WeekSummary[] = [];
  for (let w = weekStart(opts.from); w <= opts.to; w = addDays(w, 7)) {
    const list = byWeek.get(w) ?? [];
    weeks.push({
      weekStart: w,
      practices: days("practice", list),
      matches: days("match", list),
      pct: attendancePct(list),
      practicePct: attendancePct(ofKind(list, "practice")),
      matchPct: attendancePct(ofKind(list, "match")),
      excused: list.filter((r) => r.status === "excused").length,
    });
  }

  const practiceRows = ofKind(inPeriod, "practice");
  const practiceDays: WeekdaySummary[] = [...new Set(practiceRows.map((r) => dowOf(r.att_date)))]
    .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
    .map((dow) => {
      const list = practiceRows.filter((r) => dowOf(r.att_date) === dow);
      return { dow, label: WEEKDAYS[dow], sessions: new Set(list.map((r) => r.att_date)).size, pct: attendancePct(list) };
    });

  return {
    from: opts.from,
    to: opts.to,
    practices: days("practice", inPeriod),
    matches: days("match", inPeriod),
    avgPct: attendancePct(inPeriod),
    practicePct: attendancePct(practiceRows),
    matchPct: attendancePct(ofKind(inPeriod, "match")),
    players: summaries,
    weeks,
    practiceDays,
    low: summaries.filter((s) => s.pct !== null && s.pct < LOW_PCT),
  };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Umbrales de la lectura automática (a la vista para poder explicarlos). */
export const GAP_POINTS = 5; // diferencia que vale la pena mencionar
export const MATCH_ONLY = { practiceBelow: 70, matchAtLeast: 90, minMatches: 2 };
export const TREND_WEEKS = 4;

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * Lectura automática del resumen: frases cortas con lo que más se destaca.
 * Reglas simples y explicables (sin IA).
 */
export function attendanceInsights(r: AttendanceReport): string[] {
  const out: string[] = [];
  if (r.practices + r.matches === 0) return out;

  // 1. Prácticas vs. partidos
  if (r.practicePct !== null && r.matchPct !== null) {
    const gap = r.matchPct - r.practicePct;
    if (gap >= GAP_POINTS) out.push(`Se viene más a los partidos (${r.matchPct} %) que a las prácticas (${r.practicePct} %): ${gap} puntos de diferencia.`);
    else if (-gap >= GAP_POINTS) out.push(`Se viene más a las prácticas (${r.practicePct} %) que a los partidos (${r.matchPct} %): ${-gap} puntos de diferencia.`);
    else out.push(`Asistencia pareja entre prácticas (${r.practicePct} %) y partidos (${r.matchPct} %).`);
  }

  // 2. Van a los partidos pero faltan a las prácticas
  const matchOnly = r.players.filter(
    (p) =>
      p.practicePct !== null &&
      p.matchPct !== null &&
      p.practicePct < MATCH_ONLY.practiceBelow &&
      p.matchPct >= MATCH_ONLY.matchAtLeast,
  );
  if (r.matches >= MATCH_ONLY.minMatches && matchOnly.length) {
    out.push(
      `Van a los partidos pero faltan a las prácticas: ${matchOnly.map((p) => `${p.name} (${p.practicePct} % en prácticas)`).join(", ")}.`,
    );
  }

  // 3. Tendencia: últimas semanas vs. las anteriores
  const withData = r.weeks.filter((w) => w.pct !== null);
  if (withData.length >= TREND_WEEKS * 2) {
    const recent = avg(withData.slice(-TREND_WEEKS).map((w) => w.pct as number))!;
    const before = avg(withData.slice(0, -TREND_WEEKS).map((w) => w.pct as number))!;
    const diff = Math.round(recent - before);
    if (Math.abs(diff) >= GAP_POINTS) {
      out.push(`${diff > 0 ? "Mejoró" : "Bajó"} en las últimas ${TREND_WEEKS} semanas: ${Math.round(recent)} % contra ${Math.round(before)} % antes.`);
    } else {
      out.push(`Estable: las últimas ${TREND_WEEKS} semanas (${Math.round(recent)} %) están igual que antes (${Math.round(before)} %).`);
    }
  }

  // 4. Día de práctica con menos asistencia
  const days = r.practiceDays.filter((d) => d.pct !== null && d.sessions >= 2);
  if (days.length >= 2) {
    const sorted = [...days].sort((a, b) => (a.pct as number) - (b.pct as number));
    const worst = sorted[0];
    const best = sorted[sorted.length - 1];
    if ((best.pct as number) - (worst.pct as number) >= GAP_POINTS) {
      out.push(`Los ${worst.label} se falta más: ${worst.pct} % contra ${best.pct} % los ${best.label}.`);
    }
  }

  // 5. Semana más baja (y si fueron faltas justificadas)
  if (withData.length >= 3) {
    const lowest = [...withData].sort((a, b) => (a.pct as number) - (b.pct as number))[0];
    const median = [...withData].map((w) => w.pct as number).sort((a, b) => a - b)[Math.floor(withData.length / 2)];
    if (median - (lowest.pct as number) >= GAP_POINTS) {
      const excusedAvg = avg(withData.map((w) => w.excused)) ?? 0;
      const why = lowest.excused >= Math.max(3, excusedAvg * 2) ? `, con ${lowest.excused} faltas justificadas (¿exámenes, viaje?)` : "";
      const d = `${Number(lowest.weekStart.slice(8, 10))}/${Number(lowest.weekStart.slice(5, 7))}`;
      out.push(`La semana más baja fue la del ${d}: ${lowest.pct} %${why}.`);
    }
  }
  return out;
}

/** Texto corto para WhatsApp (uso interno del cuerpo técnico). */
export function reportText(r: AttendanceReport, categoryName: string, periodLabel: string, insights: string[] = []): string {
  const lines = [`Asistencia ${categoryName} · ${periodLabel}`];
  if (r.practices + r.matches === 0) {
    lines.push("No se tomó asistencia en el período.");
  } else {
    const what = [r.practices ? plural(r.practices, "práctica", "prácticas") : "", r.matches ? plural(r.matches, "partido", "partidos") : ""]
      .filter(Boolean)
      .join(" y ");
    lines.push(`${r.avgPct ?? "—"} % de asistencia en ${what}.`);
    if (r.practicePct !== null && r.matchPct !== null) lines.push(`Prácticas ${r.practicePct} % · Partidos ${r.matchPct} %.`);
    const perfect = r.players.filter((p) => p.pct === 100).length;
    if (perfect) lines.push(`${plural(perfect, "jugador", "jugadores")} con asistencia perfecta.`);
    if (r.low.length) {
      lines.push(`A seguir (menos de ${LOW_PCT} %):`);
      for (const p of r.low) lines.push(`- ${p.name}: ${p.pct} % (${plural(p.absent, "falta", "faltas")})`);
    }
  }
  // Lo más útil de la lectura (sin repetir lo de prácticas vs. partidos, que ya está arriba)
  const extra = insights.filter((x) => !/prácticas \(|partidos \(|pareja/.test(x)).slice(0, 3);
  if (extra.length) {
    lines.push("Para mirar:");
    for (const x of extra) lines.push(`- ${x}`);
  }
  lines.push("", "— Uso interno del cuerpo técnico.");
  return lines.join("\n");
}
