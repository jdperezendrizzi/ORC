import { describe, expect, it } from "vitest";
import { highlight, metricsWithData, ranking, seasonValue, teamEvolution, type DashboardData, type DashMetric } from "../dashboard";
import { fetchAll } from "../fetch-all";

const sprint: DashMetric = { id: "s10", code: "sprint_10m_s", name: "Sprint 10 m", unit: "s", decimals: 2, higherIsBetter: false, domain: "speed" };
const squat: DashMetric = { id: "sq", code: "back_squat_1rm_kg", name: "Sentadilla", unit: "kg", decimals: 1, higherIsBetter: true, domain: "strength" };
const weight: DashMetric = { id: "w", code: "weight_kg", name: "Peso", unit: "kg", decimals: 1, higherIsBetter: true, domain: "anthropometry" };

const data: DashboardData = {
  categories: [{ id: "c", name: "M17" }],
  players: [
    { id: "f1", name: "A, Pilar", categoryId: "c", unit: "forwards", position: "PI" },
    { id: "f2", name: "B, Hooker", categoryId: "c", unit: "forwards", position: "HK" },
    { id: "b1", name: "C, Wing", categoryId: "c", unit: "backs", position: "WI" },
  ],
  metrics: [sprint, squat, weight],
  points: [
    ["f1", "s10", "2026-03-14", 1.95], ["f1", "s10", "2026-06-13", 1.9],
    ["f2", "s10", "2026-03-14", 1.92],
    ["b1", "s10", "2026-03-14", 1.8], ["b1", "s10", "2026-06-13", 1.74],
    ["f1", "sq", "2026-03-14", 100], ["f2", "sq", "2026-03-14", 110], ["f1", "sq", "2026-06-13", 105], ["f2", "sq", "2026-06-13", 120],
    ["f1", "w", "2026-03-14", 95], ["f1", "w", "2026-06-13", 93],
  ],
};

describe("panel del equipo", () => {
  it("valor de temporada: mejor marca (o la última en antropometría)", () => {
    expect(seasonValue(data.points, sprint, "f1")?.value).toBe(1.9);
    expect(seasonValue(data.points, squat, "f2")?.value).toBe(120);
    expect(seasonValue(data.points, weight, "f1")?.value).toBe(93); // la última, no la "mejor"
  });

  it("ranking: el mejor primero según la métrica", () => {
    expect(ranking(data, sprint, data.players).map((r) => r.player.id)).toEqual(["b1", "f1", "f2"]);
    expect(ranking(data, squat, data.players).map((r) => r.player.id)).toEqual(["f2", "f1"]);
  });

  it("evolución: promedio por testeo, separado forwards/backs", () => {
    const evo = teamEvolution(data, sprint, data.players);
    expect(evo.map((r) => r.date)).toEqual(["2026-03-14", "2026-06-13"]);
    expect(evo[0].forwards).toBeCloseTo(1.935);
    expect(evo[0].backs).toBeCloseTo(1.8);
    expect(evo[1]).toMatchObject({ forwards: 1.9, backs: 1.74, n: 2 });
  });

  it("destacado: último testeo vs anterior y si mejoró", () => {
    const fw = data.players.filter((p) => p.unit === "forwards");
    expect(highlight(data, squat, fw)).toMatchObject({ value: 112.5, previous: 105, delta: 7.5, improved: true, n: 2 });
    const bk = data.players.filter((p) => p.unit === "backs");
    const h = highlight(data, sprint, bk);
    expect(h.improved).toBe(true); // bajó el tiempo = mejoró
    expect(h.delta).toBeCloseTo(-0.06);
    expect(highlight(data, undefined, bk).value).toBeNull();
  });

  it("sólo ofrece métricas con datos para el grupo", () => {
    const bk = data.players.filter((p) => p.unit === "backs");
    expect(metricsWithData(data, bk).map((m) => m.id)).toEqual(["s10"]);
  });
});

describe("fetchAll", () => {
  it("pide páginas hasta traer todo (Supabase corta en 1000 filas)", async () => {
    const all = Array.from({ length: 2350 }, (_, i) => i);
    const calls: [number, number][] = [];
    const rows = await fetchAll<number>(() => ({
      range: async (from: number, to: number) => {
        calls.push([from, to]);
        return { data: all.slice(from, to + 1), error: null };
      },
    }));
    expect(rows).toHaveLength(2350);
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });
});
