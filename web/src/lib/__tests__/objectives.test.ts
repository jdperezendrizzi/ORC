import { describe, expect, it } from "vitest";
import { mergeChecks, objectiveState, playerProgress, progress } from "../objectives";
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
    expect(progress([o("a"), o("b"), o("c"), o("p", "player")], checks, "2026-05-20")).toEqual({ done: 1, inProgress: 0, total: 3 });
  });

  it("lo cargado sin señal pisa la marca guardada del mismo día", () => {
    const merged = mergeChecks(checks, [c("b", "2026-05-15", true)]);
    expect(merged).toHaveLength(checks.length);
    expect(objectiveState(merged, "b", "2026-05-20").achieved).toBe(true);
  });

  it("avance por jugador (objetivos por jugador)", () => {
    const pc = (objective_id: string, player_id: string, check_date: string, achieved: boolean): ObjectiveCheck => ({
      id: `${objective_id}-${player_id}-${check_date}`, objective_id, season_id: "s", check_date, player_id, achieved, note: null,
    });
    const objs = [o("x", "player"), o("y", "player"), o("t")];
    const ch = [pc("x", "p1", "2026-05-01", true), pc("y", "p1", "2026-05-01", true), pc("y", "p1", "2026-05-08", false), pc("x", "p2", "2026-05-01", true)];
    expect(playerProgress(objs, ch, "p1", "2026-05-20")).toEqual({ done: 1, inProgress: 0, total: 2 });
    expect(playerProgress(objs, ch, "p2", "2026-05-20")).toEqual({ done: 1, inProgress: 0, total: 2 });
    expect(objectiveState(ch, "x", "2026-05-20", "p1").achieved).toBe(true);
    expect(objectiveState(ch, "x", "2026-05-20", null).achieved).toBe(false); // las del equipo no se mezclan
  });

  it("tres estados: «Todavía no», «En progreso» y «Logrado» (y compatibilidad con sí/no)", () => {
    const mk = (objective_id: string, check_date: string, status: "not_yet" | "in_progress" | "achieved"): ObjectiveCheck => ({
      id: `${objective_id}-${check_date}`, objective_id, season_id: "s", check_date, player_id: null, achieved: status === "achieved", status, note: null,
    });
    const checks = [mk("a", "2026-05-01", "not_yet"), mk("a", "2026-05-08", "in_progress"), mk("b", "2026-05-08", "in_progress"), mk("b", "2026-05-15", "achieved"), c("d", "2026-05-15", true)];
    expect(objectiveState(checks, "a", "2026-05-20").status).toBe("in_progress");
    expect(objectiveState(checks, "b", "2026-05-20")).toMatchObject({ status: "achieved", achieved: true, firstAchieved: "2026-05-15" });
    expect(objectiveState(checks, "d", "2026-05-20").status).toBe("achieved"); // marca vieja (sólo sí/no)
    expect(objectiveState(checks, "e", "2026-05-20").status).toBeNull();
    expect(progress([o("a"), o("b"), o("d"), o("e")], checks, "2026-05-20")).toEqual({ done: 2, inProgress: 1, total: 4 });
  });
});
