import { describe, expect, it } from "vitest";
import { acwr, addDays, computeAlerts, templateSummary, weekStart, weeklyFacts, withNames, type AlertInput, type WellnessPoint } from "../alerts";
import type { DashMetric } from "../dashboard";

const today = "2026-11-04";
const metrics: DashMetric[] = [
  { id: "m-cmj", code: "cmj_height_cm", name: "Salto CMJ", unit: "cm", decimals: 1, higherIsBetter: true, domain: "power" },
  { id: "m-10", code: "sprint_10m_s", name: "Sprint 10 m", unit: "s", decimals: 2, higherIsBetter: false, domain: "speed" },
  { id: "m-w", code: "weight_kg", name: "Peso", unit: "kg", decimals: 1, higherIsBetter: false, domain: "anthropometry" },
];
const base = (over: Partial<AlertInput> = {}): AlertInput => ({
  today,
  players: [
    { id: "p1", name: "Pérez, Juan", categoryId: "c1" },
    { id: "p2", name: "Gómez, Tomás", categoryId: "c1" },
  ],
  metrics,
  points: [],
  wellness: [],
  injuries: [],
  ...over,
});
const days = (n: number, fn: (d: string, i: number) => Partial<WellnessPoint>, player = "p1"): WellnessPoint[] =>
  Array.from({ length: n }, (_, i) => {
    const d = addDays(today, -i);
    return { player_id: player, log_date: d, wellness_score: 20, srpe_load: 300, ...fn(d, i) };
  });

describe("fechas", () => {
  it("lunes de la semana", () => {
    expect(weekStart("2026-11-04")).toBe("2026-11-02"); // miércoles
    expect(weekStart("2026-11-08")).toBe("2026-11-02"); // domingo
    expect(weekStart("2026-11-02")).toBe("2026-11-02");
  });
});

describe("alertas", () => {
  it("lesión con regreso vencido (alta), no si tiene alta", () => {
    const a = computeAlerts(
      base({
        injuries: [
          { id: "i1", player_id: "p1", status: "rehab", occurred_on: "2026-10-01", expected_return: "2026-10-30", actual_return: null },
          { id: "i2", player_id: "p2", status: "closed", occurred_on: "2026-10-01", expected_return: "2026-10-20", actual_return: "2026-10-25" },
        ],
      }),
    );
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ kind: "injury_overdue", severity: "alta", playerId: "p1", href: "/lesiones/i1" });
    expect(a[0].detail).toMatch(/hace 5 días/);
  });

  it("bienestar bajo en los últimos 3 registros", () => {
    const low = days(3, () => ({ wellness_score: 11 }));
    expect(computeAlerts(base({ wellness: low })).map((x) => x.kind)).toEqual(["wellness_low"]);
    const mixed = days(3, (_, i) => ({ wellness_score: i === 1 ? 15 : 11 }));
    expect(computeAlerts(base({ wellness: mixed }))).toHaveLength(0);
    // registros viejos no cuentan
    const old = days(3, () => ({ wellness_score: 10 })).map((w) => ({ ...w, log_date: addDays(w.log_date, -20) }));
    expect(computeAlerts(base({ wellness: old }))).toHaveLength(0);
  });

  it("carga en alza: semana al doble de lo habitual (con 3+ semanas de historia)", () => {
    const logs = days(28, (_, i) => ({ srpe_load: i < 7 ? 700 : 300 }));
    const r = acwr(logs, today)!;
    expect(r.ratio).toBeGreaterThan(1.5);
    expect(computeAlerts(base({ wellness: logs })).map((x) => x.kind)).toEqual(["load_spike"]);
    // sin historia suficiente no se avisa
    expect(acwr(days(10, () => ({ srpe_load: 900 })), today)).toBeNull();
  });

  it("caída de rendimiento según el sentido de la métrica y umbral", () => {
    const a = computeAlerts(
      base({
        points: [
          ["p1", "m-cmj", "2026-09-01", 40],
          ["p1", "m-cmj", "2026-10-20", 37], // −7,5 % → alerta
          ["p2", "m-10", "2026-09-01", 1.8],
          ["p2", "m-10", "2026-10-20", 1.84], // +2,2 % (tiempo) → no
          ["p1", "m-w", "2026-09-01", 70],
          ["p1", "m-w", "2026-10-20", 80], // peso no se sigue
        ],
      }),
    );
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ kind: "perf_drop", playerId: "p1" });
    expect(a[0].detail).toContain("40,0 → 37,0 cm");
  });

  it("ordena: primero las de prioridad alta", () => {
    const a = computeAlerts(
      base({
        wellness: days(3, () => ({ wellness_score: 10 }), "p2"),
        injuries: [{ id: "i1", player_id: "p1", status: "active", occurred_on: "2026-10-01", expected_return: "2026-11-01", actual_return: null }],
      }),
    );
    expect(a.map((x) => x.severity)).toEqual(["alta", "media"]);
  });
});

describe("resumen semanal", () => {
  const input = {
    ...base({
      wellness: [...days(10, () => ({ wellness_score: 18 })), ...days(3, () => ({ wellness_score: 10 }), "p2")],
      points: [
        ["p1", "m-cmj", "2026-09-01", 40],
        ["p1", "m-cmj", "2026-11-03", 44],
      ],
      injuries: [{ id: "i9", player_id: "p2", status: "active", occurred_on: "2026-11-02", expected_return: null, actual_return: null }],
    }),
    categoryName: "M17",
    sessions: [{ session_date: "2026-11-03", title: "Batería potencia", session_type: "test" }],
  };

  it("hechos sin nombres, con códigos", () => {
    const { facts, codes } = weeklyFacts(input);
    const json = JSON.stringify(facts);
    expect(json).not.toMatch(/Pérez|Gómez|Juan|Tomás/);
    expect(facts.desde).toBe("2026-10-29");
    expect(facts.lesiones).toMatchObject({ activas: 1, nuevas: 1 });
    expect(facts.mejoras).toHaveLength(1);
    expect(facts.alertas.map((a) => a.tipo)).toEqual(["Bienestar bajo"]);
    expect(facts.evaluaciones).toEqual([{ fecha: "2026-11-03", titulo: "Batería potencia" }]);
    // Gómez va antes que Pérez (alfabético) => J1 = p2, J2 = p1
    expect(codes).toEqual({ J1: "p2", J2: "p1" });
  });

  it("la plantilla y los nombres", () => {
    const { facts, codes } = weeklyFacts(input);
    const text = templateSummary(facts);
    expect(text).toMatch(/^M17, semana del/);
    expect(text).toContain("J2 en Salto CMJ");
    const named = withNames(text, codes, new Map([["p1", "Pérez, Juan"]]));
    expect(named).toContain("Pérez, Juan en Salto CMJ");
    expect(named).toContain("un jugador · Bienestar bajo"); // p2 no visible
    expect(named).not.toMatch(/\bJ\d+\b/);
  });
});
