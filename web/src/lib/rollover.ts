// Armar temporada: categoría propuesta para cada jugador (funciones puras).

import type { Outcome } from "./promotion";

export interface RolloverCategory {
  id: string;
  name: string;
  sort_order: number;
  max_age: number | null;
}

/**
 * Categoría que le corresponde por edad en la temporada: la de menor edad
 * máxima que lo incluya (edad = año de la temporada − año de nacimiento).
 * Si ya no entra en ninguna por edad, la primera del plantel superior.
 */
export function categoryForAge(categories: RolloverCategory[], birthDate: string, seasonYear: number): RolloverCategory | null {
  const age = seasonYear - Number(birthDate.slice(0, 4));
  const byAge = categories
    .filter((c) => c.max_age !== null && c.max_age >= age)
    .sort((a, b) => (a.max_age as number) - (b.max_age as number) || a.sort_order - b.sort_order);
  if (byAge.length) return byAge[0];
  return [...categories].filter((c) => c.max_age === null).sort((a, b) => a.sort_order - b.sort_order)[0] ?? null;
}

export type ProposalReason = "decision_promote" | "decision_stay" | "observe" | "age";

export const proposalReasonLabel: Record<ProposalReason, string> = {
  decision_promote: "Decisión: sube",
  decision_stay: "Decisión: se queda",
  observe: "En observación: por edad (revisar)",
  age: "Por edad",
};

/** Propuesta: la decisión de la ficha de pase manda; si no hay (o está en observación), por edad. */
export function proposeCategory(input: {
  categories: RolloverCategory[];
  currentCategoryId: string;
  birthDate: string;
  seasonYear: number;
  decision: Outcome | null;
  decisionTargetId: string | null;
  nextCategoryId: string | null;
}): { categoryId: string | null; reason: ProposalReason } {
  if (input.decision === "promote") {
    return { categoryId: input.decisionTargetId ?? input.nextCategoryId, reason: "decision_promote" };
  }
  if (input.decision === "stay") return { categoryId: input.currentCategoryId, reason: "decision_stay" };
  const byAge = categoryForAge(input.categories, input.birthDate, input.seasonYear);
  return { categoryId: byAge?.id ?? null, reason: input.decision === "observe" ? "observe" : "age" };
}
