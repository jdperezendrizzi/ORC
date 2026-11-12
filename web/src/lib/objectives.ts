// Estado del checklist de objetivos (funciones puras: se testean sin base).

import type { Objective, ObjectiveArea, ObjectiveCheck } from "./types";

export const objectiveAreaLabel: Record<ObjectiveArea, string> = {
  game: "Juego",
  contact: "Contacto / tackle",
  attitude: "Actitud",
  other: "Otros",
};
export const AREA_ORDER: ObjectiveArea[] = ["game", "contact", "attitude", "other"];

export type ObjectiveStatus = "not_yet" | "in_progress" | "achieved";
export const STATUS_ORDER: ObjectiveStatus[] = ["not_yet", "in_progress", "achieved"];
export const objectiveStatusLabel: Record<ObjectiveStatus, string> = {
  not_yet: "Todavía no",
  in_progress: "En progreso",
  achieved: "Logrado",
};
/** Ícono que acompaña siempre al texto (no depender sólo del color). */
export const objectiveStatusIcon: Record<ObjectiveStatus, string> = { not_yet: "✕", in_progress: "◐", achieved: "✓" };

/** Estado de una marca (las de la versión anterior sólo tienen sí/no). */
export const statusOf = (c: Pick<ObjectiveCheck, "status" | "achieved">): ObjectiveStatus => c.status ?? (c.achieved ? "achieved" : "not_yet");

export interface ObjectiveState {
  /** Estado según la última práctica en que se marcó (null = nunca se marcó). */
  status: ObjectiveStatus | null;
  /** Estado según la última práctica en que se marcó. */
  achieved: boolean;
  /** Fecha de la última marca (o null si nunca se marcó). */
  lastDate: string | null;
  /** Primera vez que se logró en la temporada. */
  firstAchieved: string | null;
  /** Marca del día consultado, si hay. */
  today: ObjectiveCheck | null;
  history: ObjectiveCheck[];
}

/** Estado de un objetivo del equipo (player_id null) a partir de sus marcas. */
export function objectiveState(checks: ObjectiveCheck[], objectiveId: string, date: string, playerId: string | null = null): ObjectiveState {
  const mine = checks
    .filter((c) => c.objective_id === objectiveId && (c.player_id ?? null) === playerId && c.check_date <= date)
    .sort((a, b) => a.check_date.localeCompare(b.check_date));
  const last = mine[mine.length - 1] ?? null;
  const status = last ? statusOf(last) : null;
  return {
    status,
    achieved: status === "achieved",
    lastDate: last?.check_date ?? null,
    firstAchieved: mine.find((c) => statusOf(c) === "achieved")?.check_date ?? null,
    today: mine.find((c) => c.check_date === date) ?? null,
    history: mine,
  };
}

/** Objetivos logrados (según su última marca) sobre el total. */
export interface Progress {
  done: number;
  inProgress: number;
  total: number;
}

/** Objetivos del equipo logrados y en progreso (según su última marca) sobre el total. */
export function progress(objectives: Objective[], checks: ObjectiveCheck[], date: string): Progress {
  const team = objectives.filter((o) => o.scope === "team");
  const st = team.map((o) => objectiveState(checks, o.id, date).status);
  return { done: st.filter((x) => x === "achieved").length, inProgress: st.filter((x) => x === "in_progress").length, total: team.length };
}

/** Reemplaza/agrega marcas (por id), para mostrar al instante lo cargado sin señal. */
export function mergeChecks(base: ObjectiveCheck[], local: ObjectiveCheck[]): ObjectiveCheck[] {
  const byId = new Map(base.map((c) => [c.id, c]));
  for (const c of local) byId.set(c.id, c);
  return [...byId.values()];
}

/** Objetivos por jugador logrados por un jugador (según su última marca) sobre el total. */
export function playerProgress(objectives: Objective[], checks: ObjectiveCheck[], playerId: string, date: string): Progress {
  const mine = objectives.filter((o) => o.scope === "player");
  const st = mine.map((o) => objectiveState(checks, o.id, date, playerId).status);
  return { done: st.filter((x) => x === "achieved").length, inProgress: st.filter((x) => x === "in_progress").length, total: mine.length };
}
