// Resumen de los objetivos de la temporada de una categoría (pantalla, texto y PDF).
// Funciones puras: se testean sin base.

import { addDays, weekStart } from "./alerts";
import { AREA_ORDER, objectiveAreaLabel, objectiveState, objectiveStatusIcon, objectiveStatusLabel, statusOf, type ObjectiveStatus } from "./objectives";
import type { Objective, ObjectiveArea, ObjectiveCheck } from "./types";

export type StatusOrNone = ObjectiveStatus | "unmarked";
export type Counts = Record<StatusOrNone, number>;
const zero = (): Counts => ({ achieved: 0, in_progress: 0, not_yet: 0, unmarked: 0 });

export interface ObjectivesReport {
  categoryName: string;
  seasonName: string;
  today: string;
  kind: "team" | "player";
  total: number;
  counts: Counts;
  byArea: { area: ObjectiveArea; label: string; counts: Counts; total: number }[];
  /** Semana a semana: cuántos objetivos estaban logrados / en progreso al cerrar cada semana. */
  timeline: { week: string; achieved: number; inProgress: number }[];
  /** Objetivos del equipo, con su estado y desde cuándo. */
  items: { title: string; area: ObjectiveArea; status: ObjectiveStatus | null; since: string | null; note: string | null }[];
  /** Objetivos por jugador: cuántos jugadores en cada estado. */
  perPlayer: { title: string; area: ObjectiveArea; counts: Counts; players: number }[];
}

/** Desde qué fecha está en el estado actual (inicio de la última racha igual). */
function sinceOf(history: ObjectiveCheck[]): string | null {
  if (!history.length) return null;
  const cur = statusOf(history[history.length - 1]);
  let i = history.length - 1;
  while (i > 0 && statusOf(history[i - 1]) === cur) i--;
  return history[i].check_date;
}

export function buildObjectivesReport(input: {
  categoryName: string;
  seasonName: string;
  today: string;
  objectives: Objective[]; // de la categoría
  checks: ObjectiveCheck[];
  playerIds?: string[]; // para objetivos por jugador
}): ObjectivesReport {
  const team = input.objectives.filter((o) => o.scope === "team").sort((a, b) => a.sort_order - b.sort_order);
  const perPlayerObjs = input.objectives.filter((o) => o.scope === "player").sort((a, b) => a.sort_order - b.sort_order);
  const kind: "team" | "player" = team.length === 0 && perPlayerObjs.length > 0 ? "player" : "team";
  const ids = new Set(input.objectives.map((o) => o.id));
  const checks = input.checks.filter((c) => ids.has(c.objective_id));
  const counts = zero();
  const areaCounts = new Map<ObjectiveArea, Counts>();
  const bump = (area: ObjectiveArea, k: StatusOrNone) => {
    counts[k]++;
    const a = areaCounts.get(area) ?? zero();
    a[k]++;
    areaCounts.set(area, a);
  };

  const items: ObjectivesReport["items"] = [];
  const perPlayer: ObjectivesReport["perPlayer"] = [];
  const players = input.playerIds ?? [];

  if (kind === "team") {
    for (const o of team) {
      const st = objectiveState(checks, o.id, input.today);
      bump(o.area, st.status ?? "unmarked");
      items.push({ title: o.title, area: o.area, status: st.status, since: sinceOf(st.history), note: st.history.at(-1)?.note ?? null });
    }
  } else {
    // Por jugador: cuenta jugador × objetivo
    for (const o of perPlayerObjs) {
      const c = zero();
      for (const p of players) {
        const s = objectiveState(checks, o.id, input.today, p).status ?? "unmarked";
        c[s]++;
        bump(o.area, s);
      }
      perPlayer.push({ title: o.title, area: o.area, counts: c, players: players.length });
    }
  }

  // Evolución: estado al cierre de cada semana, desde la primera marca
  const timeline: ObjectivesReport["timeline"] = [];
  const dates = checks.map((c) => c.check_date).sort();
  if (dates.length) {
    const subjects: { id: string; player: string | null }[] =
      kind === "team" ? team.map((o) => ({ id: o.id, player: null })) : perPlayerObjs.flatMap((o) => players.map((p) => ({ id: o.id, player: p })));
    for (let w = weekStart(dates[0]); w <= input.today; w = addDays(w, 7)) {
      const end = addDays(w, 6) < input.today ? addDays(w, 6) : input.today;
      let achieved = 0;
      let inProgress = 0;
      for (const s of subjects) {
        const st = objectiveState(checks, s.id, end, s.player).status;
        if (st === "achieved") achieved++;
        else if (st === "in_progress") inProgress++;
      }
      timeline.push({ week: w, achieved, inProgress });
    }
  }

  const total = kind === "team" ? team.length : perPlayerObjs.length * players.length;
  return {
    categoryName: input.categoryName,
    seasonName: input.seasonName,
    today: input.today,
    kind,
    total,
    counts,
    byArea: AREA_ORDER.filter((a) => areaCounts.has(a)).map((a) => {
      const c = areaCounts.get(a)!;
      return { area: a, label: objectiveAreaLabel[a], counts: c, total: c.achieved + c.in_progress + c.not_yet + c.unmarked };
    }),
    timeline,
    items,
    perPlayer,
  };
}

const dm = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;
const pct = (n: number, t: number) => (t ? Math.round((n / t) * 100) : 0);

/** Texto para WhatsApp. */
export function objectivesReportText(r: ObjectivesReport): string {
  const L: string[] = [`*Objetivos ${r.categoryName}* · temporada ${r.seasonName} (${dm(r.today)})`];
  const c = r.counts;
  if (r.kind === "team") {
    L.push(`✓ ${c.achieved} logrados · ◐ ${c.in_progress} en progreso · ✕ ${c.not_yet} todavía no${c.unmarked ? ` · ${c.unmarked} sin marcar` : ""} (de ${r.total}).`);
    for (const st of ["achieved", "in_progress", "not_yet"] as ObjectiveStatus[]) {
      const list = r.items.filter((i) => i.status === st);
      if (!list.length) continue;
      L.push("", `*${objectiveStatusIcon[st]} ${objectiveStatusLabel[st]}*`);
      for (const i of list) L.push(`- ${i.title}${i.since ? ` (desde ${dm(i.since)})` : ""}`);
    }
  } else {
    L.push(`Objetivos por jugador: ${pct(c.achieved, r.total)} % logrado y ${pct(c.in_progress, r.total)} % en progreso.`);
    for (const p of r.perPlayer) L.push(`- ${p.title}: ${p.counts.achieved} logrados, ${p.counts.in_progress} en progreso de ${p.players}`);
  }
  L.push("", "— Uso interno del cuerpo técnico.");
  return L.join("\n");
}
