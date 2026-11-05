// Ficha de pase de categoría (funciones puras: se testean sin base).

import type { Category } from "./types";

export type Outcome = "promote" | "stay" | "observe";
export const outcomeLabel: Record<Outcome, string> = { promote: "Sube", stay: "Se queda", observe: "En observación" };
export const outcomeTone: Record<Outcome, string> = { promote: "tone-green", stay: "tone-amber", observe: "" };

export interface Benchmark {
  n: number;
  p25: number;
  p50: number;
  p75: number;
}

export type Standing = "top" | "above" | "range" | "below";
export const standingLabel: Record<Standing, string> = {
  top: "Destacado",
  above: "Por encima de la mediana",
  range: "En el rango",
  below: "Por debajo",
};
export const standingTone: Record<Standing, string> = { top: "tone-green", above: "tone-green", range: "tone-amber", below: "tone-red" };

/** Categoría siguiente (por orden) entre las activas, o null si es la última. */
export function nextCategory(categories: Category[], currentId: string): Category | null {
  const sorted = [...categories].sort((a, b) => a.sort_order - b.sort_order);
  const i = sorted.findIndex((c) => c.id === currentId);
  return i >= 0 && i < sorted.length - 1 ? sorted[i + 1] : null;
}

/**
 * Dónde queda una marca respecto de la categoría de referencia:
 * mejor que 3 de cada 4 = destacado; mejor que la mitad = por encima de la
 * mediana; mejor que 1 de cada 4 = en el rango; si no, por debajo.
 */
export function standing(value: number, bench: Benchmark, higherIsBetter: boolean): Standing {
  // Percentiles de los valores crudos: si menos es mejor, el mejor cuarto está debajo de p25.
  if (higherIsBetter) {
    if (value > bench.p75) return "top";
    if (value >= bench.p50) return "above";
    if (value >= bench.p25) return "range";
    return "below";
  }
  if (value < bench.p25) return "top";
  if (value <= bench.p50) return "above";
  if (value <= bench.p75) return "range";
  return "below";
}

/** Mejora en la temporada (primera vs. última medición), en % con signo "bueno". */
export function seasonImprovement(first: number, last: number, higherIsBetter: boolean): number | null {
  if (first === 0) return null;
  const pct = ((last - first) / Math.abs(first)) * 100;
  return Math.round((higherIsBetter ? pct : -pct) * 10) / 10;
}

/** Cuántos tests están en la mediana o mejor, sobre los que tienen referencia. */
export function aboveMedianCount(standings: (Standing | null)[]): { above: number; total: number } {
  const withRef = standings.filter((s): s is Standing => s !== null);
  return { above: withRef.filter((s) => s === "top" || s === "above").length, total: withRef.length };
}
