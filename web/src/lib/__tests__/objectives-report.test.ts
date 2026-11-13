import { describe, expect, it } from "vitest";
import { buildObjectivesReport, objectivesReportText } from "../objectives-report";
import type { Objective, ObjectiveCheck } from "../types";

const o = (id: string, area: Objective["area"], sort: number, scope: Objective["scope"] = "team"): Objective => ({
  id, category_id: "m9", scope, area, title: `Obj ${id}`, look_for: null, exercise_name: null, exercise_description: null, exercise_url: null, sort_order: sort,
});
const k = (objective_id: string, check_date: string, status: ObjectiveCheck["status"], player_id: string | null = null): ObjectiveCheck => ({
  id: `${objective_id}${check_date}${player_id}`, objective_id, season_id: "s", check_date, player_id, achieved: status === "achieved", status, note: null,
});

describe("Resumen de objetivos", () => {
  const objectives = [o("a", "game", 1), o("b", "game", 2), o("c", "contact", 3), o("d", "other", 4)];
  const checks = [k("a", "2026-10-05", "not_yet"), k("a", "2026-10-20", "in_progress"), k("a", "2026-11-03", "achieved"), k("b", "2026-10-20", "in_progress"), k("c", "2026-11-04", "not_yet")];
  const r = buildObjectivesReport({ categoryName: "M9", seasonName: "2026", today: "2026-11-12", objectives, checks });

  it("cuenta por estado y por área", () => {
    expect(r.counts).toEqual({ achieved: 1, in_progress: 1, not_yet: 1, unmarked: 1 });
    expect(r.byArea.map((a) => [a.area, a.counts.achieved, a.counts.in_progress, a.total])).toEqual([
      ["game", 1, 1, 2],
      ["contact", 0, 0, 1],
      ["other", 0, 0, 1],
    ]);
  });
  it("estado actual y desde cuándo", () => {
    expect(r.items[0]).toMatchObject({ title: "Obj a", status: "achieved", since: "2026-11-03" });
    expect(r.items[1]).toMatchObject({ status: "in_progress", since: "2026-10-20" });
    expect(r.items[3]).toMatchObject({ status: null, since: null });
  });
  it("evolución semana a semana desde la primera marca", () => {
    expect(r.timeline[0]).toEqual({ week: "2026-10-05", achieved: 0, inProgress: 0 });
    expect(r.timeline.find((w) => w.week === "2026-10-19")).toEqual({ week: "2026-10-19", achieved: 0, inProgress: 2 });
    expect(r.timeline.at(-1)).toEqual({ week: "2026-11-09", achieved: 1, inProgress: 1 });
  });
  it("texto para WhatsApp", () => {
    const t = objectivesReportText(r);
    expect(t).toContain("*Objetivos M9* · temporada 2026 (12/11)");
    expect(t).toContain("✓ 1 logrados · ◐ 1 en progreso · ✕ 1 todavía no · 1 sin marcar (de 4).");
    expect(t).toContain("- Obj a (desde 3/11)");
    expect(t.endsWith("— Uso interno del cuerpo técnico.")).toBe(true);
  });
  it("objetivos por jugador: cuenta jugadores en cada estado", () => {
    const pr = buildObjectivesReport({
      categoryName: "M17", seasonName: "2026", today: "2026-11-12",
      objectives: [o("p", "game", 1, "player")],
      checks: [k("p", "2026-11-01", "achieved", "j1"), k("p", "2026-11-01", "in_progress", "j2")],
      playerIds: ["j1", "j2", "j3"],
    });
    expect(pr.kind).toBe("player");
    expect(pr.perPlayer[0].counts).toEqual({ achieved: 1, in_progress: 1, not_yet: 0, unmarked: 1 });
    expect(pr.total).toBe(3);
  });
});
