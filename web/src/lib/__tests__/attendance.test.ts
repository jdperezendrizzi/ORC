import { describe, expect, it } from "vitest";
import { absenceStreak, attendancePct, ratesByPlayer, type AttendanceRow } from "../attendance";
import { computeAlerts, templateSummary, weeklyFacts } from "../alerts";

const r = (player_id: string, att_date: string, status: AttendanceRow["status"], kind: AttendanceRow["kind"] = "practice"): AttendanceRow => ({
  id: `${player_id}-${att_date}`, player_id, category_id: "c1", season_id: "s", att_date, kind, status, note: null,
});

describe("asistencia", () => {
  it("% = presentes / (presentes + ausentes); justificados no cuentan", () => {
    expect(attendancePct([r("p", "2026-11-01", "present"), r("p", "2026-11-02", "absent"), r("p", "2026-11-03", "excused"), r("p", "2026-11-04", "present")])).toBe(67);
    expect(attendancePct([r("p", "2026-11-03", "excused")])).toBeNull();
  });

  it("racha de faltas: desde la última práctica; justificado y partidos la cortan/no cuentan", () => {
    expect(absenceStreak([r("p", "2026-10-28", "present"), r("p", "2026-10-30", "absent"), r("p", "2026-11-02", "absent"), r("p", "2026-11-04", "absent")]).count).toBe(3);
    expect(absenceStreak([r("p", "2026-10-30", "absent"), r("p", "2026-11-02", "excused"), r("p", "2026-11-04", "absent")]).count).toBe(1);
    expect(absenceStreak([r("p", "2026-11-02", "absent"), r("p", "2026-11-03", "absent", "match"), r("p", "2026-11-04", "absent")]).count).toBe(2);
  });

  it("por jugador", () => {
    const m = ratesByPlayer([r("a", "2026-11-01", "present"), r("a", "2026-11-02", "absent"), r("b", "2026-11-01", "present")]);
    expect(m.get("a")).toMatchObject({ present: 1, absent: 1, pct: 50 });
    expect(m.get("b")?.pct).toBe(100);
  });

  const base = {
    today: "2026-11-04",
    players: [{ id: "p1", name: "Pérez, Juan", categoryId: "c1" }],
    metrics: [],
    points: [],
    wellness: [],
    injuries: [],
  };

  it("alerta: 3 faltas seguidas sin justificar recientes", () => {
    const att = [r("p1", "2026-10-30", "absent"), r("p1", "2026-11-02", "absent"), r("p1", "2026-11-04", "absent")];
    const a = computeAlerts({ ...base, attendance: att });
    expect(a.map((x) => x.kind)).toEqual(["absences"]);
    expect(a[0].detail).toMatch(/últimas 3 prácticas/);
    // viejas: no
    const old = att.map((x) => ({ ...x, att_date: x.att_date.replace("2026-1", "2026-0") }));
    expect(computeAlerts({ ...base, attendance: old })).toHaveLength(0);
  });

  it("resumen semanal con asistencia", () => {
    const att = [r("p1", "2026-11-02", "present"), r("p1", "2026-11-04", "absent"), r("p1", "2026-11-03", "present", "match")];
    const { facts } = weeklyFacts({ ...base, attendance: att, categoryName: "M7", sessions: [] });
    expect(facts.asistencia).toEqual({ practicas: 2, partidos: 1, promedio_pct: 67, semana_anterior_pct: null });
    expect(templateSummary(facts)).toContain("Asistencia: 67 % en 2 prácticas y 1 partido");
  });
});
