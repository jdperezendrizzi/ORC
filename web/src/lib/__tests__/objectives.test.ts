import { describe, expect, it } from "vitest";
import { mergeChecks, objectiveState, progress } from "../objectives";
import type { Objective, ObjectiveCheck } from "../types";

const o = (id: string, scope: "team" | "player" = "team"): Objective => ({
  id, category_id: "c", scope, area: "game", title: id, look_for: null, exercise_name: null, exercise_description: null, exercise_url: null, sort_order: 0,
});
const c = (objective_id: string, check_date: string, achieved: boolean, id = `${objective_id}-${check_date}`): ObjectiveCheck => ({
  id, objective_id, season_id: "s", check_date, player_id: null, achieved, note: null,
});

describe("checklist de objetivos", () => {
  const checks = [c("a", "2026-05-01", false), c("a", "2026-05-08", true), c("a", "2026-05-15", true), c("b", "2026-05-08", true), c("b", "2026-05-15", false)];

  it("un objetivo tachado queda logrado hasta que se destacha", () => {
    const a = objectiveState(checks, "a", "2026-05-20");
    expect(a).toMatchObject({ achieved: true, firstAchieved: "2026-05-08", lastDate: "2026-05-15", today: null });
    const b = objectiveState(checks, "b", "2026-05-20");
    expect(b).toMatchObject({ achieved: false, firstAchieved: "2026-05-08", lastDate: "2026-05-15" });
  });

  it("mirando una práctica anterior, sólo cuenta lo marcado hasta ese día", () => {
    expect(objectiveState(checks, "a", "2026-05-01").achieved).toBe(false);
    expect(objectiveState(checks, "b", "2026-05-10").achieved).toBe(true);
    expect(objectiveState(checks, "a", "2026-05-08").today?.achieved).toBe(true);
    expect(objectiveState(checks, "z", "2026-05-08")).toMatchObject({ achieved: false, lastDate: null, firstAchieved: null });
  });

  it("avance: logrados sobre el total (sólo objetivos de equipo)", () => {
    expect(progress([o("a"), o("b"), o("c"), o("p", "player")], checks, "2026-05-20")).toEqual({ done: 1, total: 3 });
  });

  it("lo cargado sin señal pisa la marca guardada del mismo día", () => {
    const merged = mergeChecks(checks, [c("b", "2026-05-15", true)]);
    expect(merged).toHaveLength(checks.length);
    expect(objectiveState(merged, "b", "2026-05-20").achieved).toBe(true);
  });
});
