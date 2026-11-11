import { describe, expect, it } from "vitest";
import { buildTeamReport, teamReportText } from "../team-report";
import type { DashboardData } from "../dashboard";

const players = [
  { id: "a", name: "Aguirre, Lautaro" },
  { id: "b", name: "Benítez, Ignacio" },
  { id: "c", name: "Castro, Juan" },
];
const att = (player_id: string, att_date: string, status: "present" | "absent" | "excused", kind: "practice" | "match" = "practice") => ({
  id: `${player_id}${att_date}${kind}`,
  player_id,
  category_id: "m17",
  season_id: "s",
  att_date,
  kind,
  status,
  note: null,
});
const dash: DashboardData = {
  categories: [{ id: "m17", name: "M17" }],
  players: [
    { id: "a", name: "Aguirre, Lautaro", categoryId: "m17", unit: "backs", position: "AP" },
    { id: "b", name: "Benítez, Ignacio", categoryId: "m17", unit: "forwards", position: "PI" },
    { id: "c", name: "Castro, Juan", categoryId: "m17", unit: "backs", position: "W" },
  ],
  metrics: [{ id: "s10", code: "sprint_10m_s", name: "Sprint 10 m", unit: "s", decimals: 2, higherIsBetter: false, domain: "speed" }],
  points: [
    ["a", "s10", "2026-09-01", 1.9],
    ["c", "s10", "2026-09-01", 2.0],
    ["a", "s10", "2026-10-20", 1.8],
    ["c", "s10", "2026-10-20", 1.9],
  ],
};

describe("Estado del equipo", () => {
  const r = buildTeamReport({
    categoryId: "m17",
    categoryName: "M17",
    seasonName: "2026",
    today: "2026-11-11",
    players,
    injuries: [
      { player_id: "b", status: "rehab", expected_return: "2026-11-20" },
      { player_id: "c", status: "return_to_play", expected_return: null },
      { player_id: "a", status: "closed", expected_return: null },
    ],
    noConsent: 1,
    attendance: [
      att("a", "2026-11-10", "present"),
      att("b", "2026-11-10", "absent"),
      att("c", "2026-11-10", "present"),
      att("a", "2026-11-08", "present", "match"),
      att("b", "2026-11-08", "absent", "match"),
      att("c", "2026-11-08", "present", "match"),
      att("b", "2026-09-01", "present"), // fuera de los 30 días
    ],
    alerts: [{ kind: "absences", severity: "media", playerId: "b", categoryId: "m17", detail: "Faltó a las últimas 3 prácticas.", href: "/" }],
    dashboard: dash,
    wellness: [
      { player_id: "a", log_date: "2026-11-10", wellness_score: 18 },
      { player_id: "c", log_date: "2026-11-09", wellness_score: 16 },
      { player_id: "c", log_date: "2026-10-01", wellness_score: 5 },
    ],
  });

  it("disponibles: sólo el alta deportiva (en vuelta) cuenta como disponible", () => {
    expect(r.total).toBe(3);
    expect(r.available).toBe(2);
    expect(r.injured?.map((x) => x.name)).toEqual(["Benítez, Ignacio", "Castro, Juan"]);
  });
  it("asistencia de los últimos 30 días, separada por tipo", () => {
    expect(r.attendance).toMatchObject({ pct: 67, practicePct: 67, matchPct: 67, sessions: 2 });
    expect(r.attendance?.low).toEqual([{ name: "Benítez, Ignacio", pct: 0 }]);
  });
  it("tests: promedio del último testeo y cambio (menos es mejor en sprint)", () => {
    expect(r.tests).toEqual([{ label: "Backs · Sprint 10 m", value: "1,85", unit: "s", change: "-0,10", improved: true, n: 2, date: "2026-10-20" }]);
  });
  it("bienestar de los últimos 7 días", () => {
    expect(r.wellness).toEqual({ avg: 17, logs: 2, players: 2 });
  });
  it("texto para WhatsApp con nombres y aviso de uso interno", () => {
    const t = teamReportText(r);
    expect(t).toContain("*Estado del equipo · M17* (11/11)");
    expect(t).toContain("3 jugadores · 2 disponibles.");
    expect(t).toContain("- Benítez, Ignacio: en rehabilitación, vuelve aprox. 20/11");
    expect(t).toContain("- Faltas seguidas · Benítez, Ignacio: Faltó a las últimas 3 prácticas.");
    expect(t).toContain("- Backs · Sprint 10 m: 1,85 s, -0,10 vs. el anterior ✓ (2 jug., 20/10)");
    expect(t).toContain("1 jugador sin consentimiento");
    expect(t.endsWith("— Uso interno del cuerpo técnico.")).toBe(true);
  });
  it("sin módulos: no incluye esas secciones", () => {
    const min = buildTeamReport({ categoryId: "m17", categoryName: "M17", seasonName: "2026", today: "2026-11-11", players });
    expect(min).toMatchObject({ available: null, injured: null, attendance: null, alerts: null, tests: null, wellness: null });
    expect(teamReportText(min)).not.toContain("Asistencia");
  });
});
