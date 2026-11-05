// Estado del checklist de objetivos (funciones puras: se testean sin base).

import type { Objective, ObjectiveArea, ObjectiveCheck } from "./types";

export const objectiveAreaLabel: Record<ObjectiveArea, string> = {
  game: "Juego",
  contact: "Contacto / tackle",
  attitude: "Actitud",
  other: "Otros",
};
export const AREA_ORDER: ObjectiveArea[] = ["game", "contact", "attitude", "other"];

export interface ObjectiveState {
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
  return {
    achieved: !!last?.achieved,
    lastDate: last?.check_date ?? null,
    firstAchieved: mine.find((c) => c.achieved)?.check_date ?? null,
    today: mine.find((c) => c.check_date === date) ?? null,
    history: mine,
  };
}

/** Objetivos logrados (según su última marca) sobre el total. */
export function progress(objectives: Objective[], checks: ObjectiveCheck[], date: string): { done: number; total: number } {
  const team = objectives.filter((o) => o.scope === "team");
  return { done: team.filter((o) => objectiveState(checks, o.id, date).achieved).length, total: team.length };
}

/** Reemplaza/agrega marcas (por id), para mostrar al instante lo cargado sin señal. */
export function mergeChecks(base: ObjectiveCheck[], local: ObjectiveCheck[]): ObjectiveCheck[] {
  const byId = new Map(base.map((c) => [c.id, c]));
  for (const c of local) byId.set(c.id, c);
  return [...byId.values()];
}
