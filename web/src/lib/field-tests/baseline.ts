// CMJ semanal: base del jugador y veredicto. ÚNICA función de base: la usan
// la pantalla de carga y el motor de alertas (no copiarla).

import type { CmjParams } from "./protocol";

export interface CmjDayPoint {
  date: string; // YYYY-MM-DD
  value: number; // cm
  method: string;
}

const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

export interface CmjBaseline {
  value: number | null;
  days: number;
  needed: number;
}

/**
 * Promedio del MEJOR salto de cada día en los N días anteriores a `onDate`
 * (sin incluirlo), sólo con el mismo método. Hace falta un mínimo de días.
 */
export function cmjBaseline(points: CmjDayPoint[], onDate: string, method: string, w: CmjParams["weekly"]): CmjBaseline {
  const best = new Map<string, number>();
  for (const p of points) {
    if (p.method !== method) continue;
    const d = dayDiff(p.date, onDate);
    if (d < 1 || d > w.baseline_days) continue;
    best.set(p.date, Math.max(best.get(p.date) ?? -Infinity, p.value));
  }
  const days = best.size;
  if (days < w.min_days) return { value: null, days, needed: w.min_days };
  const vals = [...best.values()];
  return { value: vals.reduce((a, b) => a + b, 0) / days, days, needed: w.min_days };
}

export type Verdict = "ok" | "warn" | "crit";
export const verdictLabel: Record<Verdict, string> = { ok: "Bien", warn: "Atención", crit: "Crítico" };
export const verdictIcon: Record<Verdict, string> = { ok: "✓", warn: "⚠", crit: "⛔" };

/** Caída respecto de la base (en %, positiva = peor) y su nivel. */
export function cmjVerdict(value: number, baseline: number, w: CmjParams["weekly"]): { level: Verdict; dropPct: number } {
  const dropPct = ((baseline - value) / baseline) * 100;
  const level: Verdict = dropPct > w.crit_drop_pct ? "crit" : dropPct > w.warn_drop_pct ? "warn" : "ok";
  return { level, dropPct };
}

export const VERDICT_DISCLAIMER = "Es una pista de carga y fatiga, no un diagnóstico.";
