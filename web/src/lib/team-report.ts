// «Estado del equipo»: resumen de una categoría (lo que se ve en el Inicio)
// para compartir con el cuerpo técnico. Funciones puras (se testean sin base).

import { alertKindLabel, type Alert } from "./alerts";
import { attendancePct, ratesByPlayer, type AttendanceRow } from "./attendance";
import { LOW_PCT } from "./attendance-report";
import { highlight, type DashboardData, type DashPlayer } from "./dashboard";
import { injuryStatusLabel } from "./labels";
import { formatValue } from "./validation";

/** Tests que resumen al equipo (los mismos de las tarjetas del Inicio). */
export const TEAM_TESTS: { code: string; label: string; group: "all" | "forwards" | "backs" }[] = [
  { code: "back_squat_1rm_kg", label: "Forwards · Sentadilla 1RM", group: "forwards" },
  { code: "sprint_10m_s", label: "Backs · Sprint 10 m", group: "backs" },
  { code: "cmj_height_cm", label: "Equipo · CMJ", group: "all" },
  { code: "ift_vift_kmh", label: "Equipo · VIFT (30-15)", group: "all" },
  { code: "yoyo_ir1_distance_m", label: "Equipo · Yo-Yo IR1", group: "all" },
];

export const ATTENDANCE_DAYS = 30;
export const WELLNESS_DAYS = 7;

export interface TeamReportInput {
  categoryId: string;
  categoryName: string;
  seasonName: string;
  today: string;
  players: { id: string; name: string }[];
  /** Cada sección es opcional: sólo va si el usuario tiene ese módulo. */
  injuries?: { player_id: string; status: string; expected_return: string | null }[];
  noConsent?: number;
  attendance?: AttendanceRow[];
  alerts?: Alert[];
  dashboard?: DashboardData;
  wellness?: { player_id: string; log_date: string; wellness_score: number | null }[];
}

export interface TeamReport {
  categoryName: string;
  seasonName: string;
  today: string;
  total: number;
  available: number | null;
  injured: { name: string; status: string; back: string | null }[] | null;
  noConsent: number | null;
  attendance: { pct: number | null; practicePct: number | null; matchPct: number | null; sessions: number; low: { name: string; pct: number }[] } | null;
  alerts: { label: string; name: string; detail: string; severity: string }[] | null;
  tests: { label: string; value: string; unit: string; change: string | null; improved: boolean | null; n: number; date: string | null }[] | null;
  wellness: { avg: number | null; logs: number; players: number } | null;
}

const dm = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export function buildTeamReport(i: TeamReportInput): TeamReport {
  const names = new Map(i.players.map((p) => [p.id, p.name]));
  const ids = new Set(i.players.map((p) => p.id));

  const openInj = i.injuries?.filter((x) => ids.has(x.player_id) && x.status !== "closed");
  const injured = openInj
    ? openInj
        .map((x) => ({ name: names.get(x.player_id) ?? "—", status: injuryStatusLabel[x.status] ?? x.status, back: x.expected_return }))
        .sort((a, b) => a.name.localeCompare(b.name))
    : null;
  const unavailable = openInj ? new Set(openInj.filter((x) => x.status !== "return_to_play").map((x) => x.player_id)).size : null;

  let attendance: TeamReport["attendance"] = null;
  if (i.attendance) {
    const from = addDays(i.today, -(ATTENDANCE_DAYS - 1));
    const rows = i.attendance.filter((r) => r.category_id === i.categoryId && ids.has(r.player_id) && r.att_date >= from && r.att_date <= i.today);
    const rates = ratesByPlayer(rows);
    attendance = {
      pct: attendancePct(rows),
      practicePct: attendancePct(rows.filter((r) => r.kind === "practice")),
      matchPct: attendancePct(rows.filter((r) => r.kind === "match")),
      sessions: new Set(rows.map((r) => `${r.att_date}|${r.kind}`)).size,
      low: [...rates.entries()]
        .filter(([, v]) => v.pct !== null && v.pct < LOW_PCT)
        .map(([id, v]) => ({ name: names.get(id) ?? "—", pct: v.pct as number }))
        .sort((a, b) => a.pct - b.pct),
    };
  }

  const alerts = i.alerts
    ? i.alerts
        .filter((a) => a.categoryId === i.categoryId && ids.has(a.playerId))
        .map((a) => ({ label: alertKindLabel[a.kind], name: names.get(a.playerId) ?? "—", detail: a.detail, severity: a.severity }))
    : null;

  let tests: TeamReport["tests"] = null;
  if (i.dashboard) {
    const d = i.dashboard;
    const catPlayers: DashPlayer[] = d.players.filter((p) => p.categoryId === i.categoryId);
    tests = [];
    for (const t of TEAM_TESTS) {
      const m = d.metrics.find((x) => x.code === t.code);
      if (!m) continue;
      const group = t.group === "all" ? catPlayers : catPlayers.filter((p) => p.unit === t.group);
      const h = highlight(d, m, group);
      if (h.value === null) continue;
      tests.push({
        label: t.label,
        value: formatValue(h.value, m.decimals),
        unit: m.unit,
        change: h.delta === null ? null : `${h.delta > 0 ? "+" : ""}${formatValue(h.delta, m.decimals)}`,
        improved: h.improved,
        n: h.n,
        date: h.date,
      });
    }
  }

  let wellness: TeamReport["wellness"] = null;
  if (i.wellness) {
    const from = addDays(i.today, -(WELLNESS_DAYS - 1));
    const rows = i.wellness.filter((w) => ids.has(w.player_id) && w.log_date >= from && w.log_date <= i.today && w.wellness_score !== null);
    const sum = rows.reduce((a, w) => a + Number(w.wellness_score), 0);
    wellness = { avg: rows.length ? sum / rows.length : null, logs: rows.length, players: new Set(rows.map((w) => w.player_id)).size };
  }

  return {
    categoryName: i.categoryName,
    seasonName: i.seasonName,
    today: i.today,
    total: i.players.length,
    available: unavailable === null ? null : i.players.length - unavailable,
    injured,
    noConsent: i.noConsent ?? null,
    attendance,
    alerts,
    tests,
    wellness,
  };
}

/** Texto para WhatsApp. */
export function teamReportText(r: TeamReport): string {
  const L: string[] = [`*Estado del equipo · ${r.categoryName}* (${dm(r.today)})`];
  L.push(r.available === null ? `${r.total} jugadores.` : `${r.total} jugadores · ${r.available} disponibles.`);
  if (r.injured?.length) {
    L.push("", "*Lesionados*");
    for (const x of r.injured) L.push(`- ${x.name}: ${x.status.toLowerCase()}${x.back ? `, vuelve aprox. ${dm(x.back)}` : ""}`);
  }
  if (r.attendance) {
    L.push("", `*Asistencia (últimos ${ATTENDANCE_DAYS} días)*`);
    if (r.attendance.sessions === 0) L.push("No se tomó asistencia.");
    else {
      L.push(
        `${r.attendance.pct ?? "—"} % en ${r.attendance.sessions} ${r.attendance.sessions === 1 ? "día" : "días"}` +
          (r.attendance.practicePct !== null || r.attendance.matchPct !== null ? ` (prácticas ${r.attendance.practicePct ?? "—"} %, partidos ${r.attendance.matchPct ?? "—"} %).` : "."),
      );
      if (r.attendance.low.length) L.push(`Menos de ${LOW_PCT} %: ${r.attendance.low.map((x) => `${x.name} (${x.pct} %)`).join(", ")}.`);
    }
  }
  if (r.alerts) {
    L.push("", "*Para mirar*");
    if (r.alerts.length === 0) L.push("Sin alertas.");
    for (const a of r.alerts.slice(0, 10)) L.push(`- ${a.label} · ${a.name}: ${a.detail}`);
    if (r.alerts.length > 10) L.push(`… y ${r.alerts.length - 10} más (ver en la app).`);
  }
  if (r.tests?.length) {
    L.push("", "*Tests (promedio del último testeo)*");
    for (const t of r.tests) {
      const ch = t.change ? `, ${t.change} vs. el anterior${t.improved === true ? " ✓" : t.improved === false ? " ↓" : ""}` : "";
      L.push(`- ${t.label}: ${t.value} ${t.unit}${ch} (${t.n} jug.${t.date ? `, ${dm(t.date)}` : ""})`);
    }
  }
  if (r.wellness) {
    L.push("", `*Bienestar (últimos ${WELLNESS_DAYS} días)*`);
    L.push(r.wellness.avg === null ? "Sin registros." : `${formatValue(r.wellness.avg, 1)} /25 de promedio (${r.wellness.logs} registros de ${r.wellness.players} jugadores).`);
  }
  if (r.noConsent) L.push("", `${r.noConsent} ${r.noConsent === 1 ? "jugador" : "jugadores"} sin consentimiento de datos de rendimiento.`);
  L.push("", "— Uso interno del cuerpo técnico.");
  return L.join("\n");
}
