import { describe, expect, it } from "vitest";
import { formatInput, parseMetricValue } from "../validation";

const sprint = { min_valid: 1.4, max_valid: 3.5, unit: "s", decimals: 2 };
const reps = { min_valid: 1, max_valid: 12, unit: "reps", decimals: 0 };
const yoyo = { min_valid: 40, max_valid: 4000, unit: "m", decimals: 0 };

describe("parseMetricValue", () => {
  it("acepta coma y punto decimal", () => {
    expect(parseMetricValue("1,85", sprint)).toEqual({ ok: true, value: 1.85 });
    expect(parseMetricValue(" 1.85 ", sprint)).toEqual({ ok: true, value: 1.85 });
  });
  it("vacío no es error", () => {
    expect(parseMetricValue("   ", sprint)).toEqual({ ok: false, empty: true });
  });
  it("rechaza fuera de rango (error de tipeo típico: 18,5 en vez de 1,85)", () => {
    const r = parseMetricValue("18,5", sprint);
    expect(r.ok).toBe(false);
    expect(!r.ok && !r.empty && r.error).toMatch(/Máximo 3,5 s/);
  });
  it("rechaza texto y decimales donde va entero", () => {
    expect(parseMetricValue("1,8a", sprint).ok).toBe(false);
    expect(parseMetricValue("5,5", reps)).toMatchObject({ ok: false, error: "Debe ser un número entero" });
  });
});

describe("formatInput", () => {
  it("no usa separador de miles (round-trip seguro)", () => {
    const shown = formatInput(1480, 0);
    expect(shown).toBe("1480");
    expect(parseMetricValue(shown, yoyo)).toEqual({ ok: true, value: 1480 });
  });
  it("usa coma decimal con los decimales de la métrica", () => {
    expect(formatInput(1.8, 2)).toBe("1,80");
    expect(parseMetricValue(formatInput(1.8, 2), sprint)).toEqual({ ok: true, value: 1.8 });
  });
});

import { clubToday } from "../validation";
describe("clubToday", () => {
  it("usa la fecha de Argentina aunque el servidor esté en UTC", () => {
    // 2026-11-02 01:30 UTC = 2026-11-01 22:30 en Buenos Aires
    expect(clubToday(new Date("2026-11-02T01:30:00Z"))).toBe("2026-11-01");
    expect(clubToday(new Date("2026-11-02T03:30:00Z"))).toBe("2026-11-02");
  });
});
