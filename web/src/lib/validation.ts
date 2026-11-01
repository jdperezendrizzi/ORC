import type { TestMetric } from "./types";

export type ParseResult =
  | { ok: true; value: number }
  | { ok: false; empty: true }
  | { ok: false; empty: false; error: string };

/**
 * Parsea lo que se tipea en la cancha. Acepta coma o punto decimal
 * ("1,85" / "1.85") y valida contra el rango de plausibilidad de la métrica
 * (el mismo que aplica la base: así el error aparece antes de sincronizar).
 */
export function parseMetricValue(raw: string, metric: Pick<TestMetric, "min_valid" | "max_valid" | "unit" | "decimals">): ParseResult {
  const text = raw.trim().replace(/\s+/g, "").replace(",", ".");
  if (text === "") return { ok: false, empty: true };
  if (!/^-?\d+(\.\d+)?$/.test(text)) {
    return { ok: false, empty: false, error: "No es un número" };
  }
  const value = Number(text);
  if (metric.decimals === 0 && !Number.isInteger(value)) {
    return { ok: false, empty: false, error: "Debe ser un número entero" };
  }
  if (metric.min_valid !== null && value < metric.min_valid) {
    return { ok: false, empty: false, error: `Mínimo ${fmt(metric.min_valid)} ${metric.unit}` };
  }
  if (metric.max_valid !== null && value > metric.max_valid) {
    return { ok: false, empty: false, error: `Máximo ${fmt(metric.max_valid)} ${metric.unit}` };
  }
  return { ok: true, value };
}

const fmt = (n: number) => n.toLocaleString("es-AR");

/** Valor para un input editable: coma decimal y SIN separador de miles
 *  (con es-AR, 1450 se vería "1.450" y se re-parsearía como 1,45). */
export function formatInput(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  return value.toLocaleString("es-AR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: false,
  });
}

/** Formatea un valor con los decimales de la métrica (coma decimal). */
export function formatValue(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toLocaleString("es-AR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Fecha local YYYY-MM-DD (no UTC: a la noche en Argentina UTC ya es "mañana"). */
export function localDate(d = new Date()): string {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
}

export function ageOn(birthDate: string, on: string = localDate()): number {
  // slice: tolera "2009-05-01" y "2009-05-01T03:00:00Z"
  const b = new Date(`${birthDate.slice(0, 10)}T00:00:00`);
  const d = new Date(`${on.slice(0, 10)}T00:00:00`);
  let age = d.getFullYear() - b.getFullYear();
  if (d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate())) age--;
  return age;
}
