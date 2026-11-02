import { describe, expect, it } from "vitest";
import { buildPlayerReportPdf, reportMetrics, zText, type ReportMetric } from "../report/player-report";

const m = (code: string, domain: string, series: ReportMetric["series"]): ReportMetric => ({
  code, name: code, unit: "s", decimals: 2, higherIsBetter: false, domain, series,
});

describe("informe de rendimiento", () => {
  it("sólo incluye rendimiento: nunca antropometría (peso, % graso, maduración)", () => {
    const all = [
      m("sprint_10m_s", "speed", [{ date: "2026-06-13", value: 1.8, z: 0.3 }]),
      m("body_fat_pct", "anthropometry", [{ date: "2026-06-13", value: 15, z: 0 }]),
      m("weight_kg", "anthropometry", [{ date: "2026-06-13", value: 70, z: 0 }]),
      m("cmj_height_cm", "power", []), // sin datos
    ];
    expect(reportMetrics(all).map((x) => x.code)).toEqual(["sprint_10m_s"]);
  });

  it("comparación en palabras", () => {
    expect(zText(1.2)).toBe("Muy por encima del promedio");
    expect(zText(0.6)).toBe("Por encima del promedio");
    expect(zText(0)).toBe("En el promedio");
    expect(zText(-0.7)).toBe("Por debajo del promedio");
    expect(zText(-1.5)).toBe("Bastante por debajo del promedio");
    expect(zText(null)).toMatch(/Sin comparación/);
  });

  it("genera un PDF válido (con varias páginas si hace falta)", async () => {
    const metrics = Array.from({ length: 30 }, (_, i) =>
      m(`sprint_10m_s`, ["speed", "power", "agility", "endurance", "rugby", "strength"][i % 6], [
        { date: "2026-03-14", value: 1.9, z: null },
        { date: "2026-06-13", value: 1.85, z: -0.4 },
      ]),
    );
    const blob = await buildPlayerReportPdf(
      { playerName: "Tomás García", subtitle: "Menores de 15 · Apertura · 15 años", seasonName: "2026", issuedBy: "Profe", issuedOn: "2026-11-01", minor: true, metrics },
      null,
    );
    const head = new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()).slice(0, 5));
    expect(head).toBe("%PDF-");
    expect(blob.size).toBeGreaterThan(3000);
  });
});
