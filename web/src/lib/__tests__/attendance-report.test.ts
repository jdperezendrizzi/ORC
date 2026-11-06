import { describe, expect, it } from "vitest";
import { buildAttendanceReport, periodFor, reportText } from "../attendance-report";
import type { AttendanceRow } from "../attendance";

const r = (player_id: string, att_date: string, status: AttendanceRow["status"], kind: AttendanceRow["kind"] = "practice"): AttendanceRow => ({
  id: `${player_id}-${att_date}`, player_id, category_id: "c", season_id: "s", att_date, kind, status, note: null,
});
const season = { starts_on: "2026-01-01", ends_on: "2026-12-31" };

describe("resumen de asistencia", () => {
  it("períodos", () => {
    expect(periodFor("mes", "2026-11-06", season)).toEqual({ from: "2026-11-01", to: "2026-11-06", label: "noviembre 2026" });
    expect(periodFor("mes-anterior", "2026-11-06", season)).toEqual({ from: "2026-10-01", to: "2026-10-31", label: "octubre 2026" });
    expect(periodFor("mes-anterior", "2026-01-10", season).from).toBe("2025-12-01");
    expect(periodFor("temporada", "2026-11-06", season)).toMatchObject({ from: "2026-01-01", to: "2026-11-06" });
    expect(periodFor("rango", "2026-11-06", season, { from: "2026-10-05", to: "2026-10-20" })).toMatchObject({ from: "2026-10-05", to: "2026-10-20", label: "del 5/10 al 20/10" });
    expect(periodFor("rango", "2026-11-06", season, { from: "2026-10-20", to: "2026-10-05" }).to).toBe("2026-11-06");
  });

  const players = [
    { id: "a", name: "Álvarez, Tomás" },
    { id: "b", name: "Benítez, Ignacio" },
    { id: "c", name: "Castro, Juan" },
  ];
  const rows = [
    r("a", "2026-10-06", "present"), r("a", "2026-10-08", "present"), r("a", "2026-10-11", "present", "match"),
    r("b", "2026-10-06", "absent"), r("b", "2026-10-08", "absent"), r("b", "2026-10-11", "present", "match"),
    r("c", "2026-10-06", "excused"),
    r("a", "2026-09-30", "absent"), // fuera del período
  ];

  it("totales, por jugador (de menor a mayor) y por semana", () => {
    const rep = buildAttendanceReport(rows, players, { from: "2026-10-01", to: "2026-10-31", kind: "all" });
    expect(rep).toMatchObject({ practices: 2, matches: 1, avgPct: 67 });
    expect(rep.players.map((p) => [p.id, p.pct])).toEqual([["b", 33], ["a", 100], ["c", null]]);
    expect(rep.low.map((p) => p.id)).toEqual(["b"]);
    const w = rep.weeks.find((x) => x.weekStart === "2026-10-05")!;
    expect(w).toEqual({ weekStart: "2026-10-05", practices: 2, matches: 1, pct: 67 });
    expect(rep.weeks[0].weekStart).toBe("2026-09-28");
  });

  it("sólo prácticas", () => {
    const rep = buildAttendanceReport(rows, players, { from: "2026-10-01", to: "2026-10-31", kind: "practice" });
    expect(rep).toMatchObject({ practices: 2, matches: 0, avgPct: 50 });
  });

  it("texto para compartir", () => {
    const rep = buildAttendanceReport(rows, players, { from: "2026-10-01", to: "2026-10-31", kind: "all" });
    const t = reportText(rep, "M17", "octubre 2026");
    expect(t).toContain("Asistencia M17 · octubre 2026");
    expect(t).toContain("67 % de asistencia en 2 prácticas y 1 partido.");
    expect(t).toContain("1 jugador con asistencia perfecta.");
    expect(t).toContain("- Benítez, Ignacio: 33 % (2 faltas)");
    expect(reportText(buildAttendanceReport([], players, { from: "2026-10-01", to: "2026-10-31", kind: "all" }), "M17", "x")).toContain("No se tomó asistencia");
  });
});
