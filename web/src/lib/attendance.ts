// Asistencia (funciones puras: se testean sin base).

export type AttendanceStatus = "present" | "absent" | "excused";
export type AttendanceKind = "practice" | "match";

export interface AttendanceRow {
  id: string;
  player_id: string;
  category_id: string;
  season_id: string;
  att_date: string;
  kind: AttendanceKind;
  status: AttendanceStatus;
  note: string | null;
}

export const attendanceStatusLabel: Record<AttendanceStatus, string> = {
  present: "Presente",
  absent: "Ausente",
  excused: "Justificado",
};
export const attendanceKindLabel: Record<AttendanceKind, string> = { practice: "Práctica", match: "Partido" };

/** Faltas seguidas sin justificar a prácticas para avisar. */
export const ABSENCE_STREAK = 3;

export function countByStatus(rows: { status: AttendanceStatus }[]) {
  const c = { present: 0, absent: 0, excused: 0 };
  for (const r of rows) c[r.status]++;
  return c;
}

/** % de asistencia = presentes / (presentes + ausentes). Justificados no cuentan. */
export function attendancePct(rows: { status: AttendanceStatus }[]): number | null {
  const c = countByStatus(rows);
  const base = c.present + c.absent;
  return base === 0 ? null : Math.round((c.present / base) * 100);
}

/** Faltas sin justificar seguidas a prácticas, contando desde la última. Justificado corta la racha. */
export function absenceStreak(rows: AttendanceRow[]): { count: number; dates: string[] } {
  const practices = rows.filter((r) => r.kind === "practice").sort((a, b) => b.att_date.localeCompare(a.att_date));
  const dates: string[] = [];
  for (const r of practices) {
    if (r.status !== "absent") break;
    dates.push(r.att_date);
  }
  return { count: dates.length, dates };
}

/** Por jugador: presentes, ausentes, justificados y %. */
export function ratesByPlayer(rows: AttendanceRow[]): Map<string, { present: number; absent: number; excused: number; pct: number | null }> {
  const by = new Map<string, AttendanceRow[]>();
  for (const r of rows) {
    const list = by.get(r.player_id);
    if (list) list.push(r);
    else by.set(r.player_id, [r]);
  }
  const out = new Map<string, { present: number; absent: number; excused: number; pct: number | null }>();
  for (const [pid, list] of by) out.set(pid, { ...countByStatus(list), pct: attendancePct(list) });
  return out;
}
