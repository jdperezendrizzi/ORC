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
}

export interface WeekSummary {
  weekStart: string;
  practices: number;
  matches: number;
  pct: number | null;
}

export interface AttendanceReport {
  from: string;
  to: string;
  practices: number;
  matches: number;
  avgPct: number | null;
  players: PlayerSummary[]; // de menor a mayor asistencia (sin datos al final)
  weeks: WeekSummary[];
  low: PlayerSummary[]; // debajo de LOW_PCT
}

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
    return { id: p.id, name: p.name, ...countByStatus(list), pct: attendancePct(list) };
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
    weeks.push({ weekStart: w, practices: days("practice", list), matches: days("match", list), pct: attendancePct(list) });
  }

  return {
    from: opts.from,
    to: opts.to,
    practices: days("practice", inPeriod),
    matches: days("match", inPeriod),
    avgPct: attendancePct(inPeriod),
    players: summaries,
    weeks,
    low: summaries.filter((s) => s.pct !== null && s.pct < LOW_PCT),
  };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Texto corto para WhatsApp (uso interno del cuerpo técnico). */
export function reportText(r: AttendanceReport, categoryName: string, periodLabel: string): string {
  const lines = [`Asistencia ${categoryName} · ${periodLabel}`];
  if (r.practices + r.matches === 0) {
    lines.push("No se tomó asistencia en el período.");
  } else {
    const what = [r.practices ? plural(r.practices, "práctica", "prácticas") : "", r.matches ? plural(r.matches, "partido", "partidos") : ""]
      .filter(Boolean)
      .join(" y ");
    lines.push(`${r.avgPct ?? "—"} % de asistencia en ${what}.`);
    const perfect = r.players.filter((p) => p.pct === 100).length;
    if (perfect) lines.push(`${plural(perfect, "jugador", "jugadores")} con asistencia perfecta.`);
    if (r.low.length) {
      lines.push(`A seguir (menos de ${LOW_PCT} %):`);
      for (const p of r.low) lines.push(`- ${p.name}: ${p.pct} % (${plural(p.absent, "falta", "faltas")})`);
    }
  }
  lines.push("", "— Uso interno del cuerpo técnico.");
  return lines.join("\n");
}
