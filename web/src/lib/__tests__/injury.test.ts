import { describe, expect, it } from "vitest";
import { validateInjury, type InjuryDraft } from "../injury";

const ok: InjuryDraft = {
  player_id: "p1",
  occurred_on: "2026-11-01",
  context: "match",
  body_region: "knee",
  injury_type: "ligament",
  side: "left",
  mechanism: "contact",
  is_recurrence: false,
  expected_return: "2026-12-01",
  summary: "Torsión en un ruck",
};
const consent = new Set(["p1"]);
const today = "2026-11-02";

describe("validación de lesión (en el celular)", () => {
  it("acepta una lesión completa", () => {
    expect(validateInjury(ok, today, consent)).toBeNull();
  });
  it("exige jugador con consentimiento de salud", () => {
    expect(validateInjury({ ...ok, player_id: "" }, today, consent)).toMatch(/jugador/);
    expect(validateInjury({ ...ok, player_id: "p9" }, today, consent)).toMatch(/consentimiento/);
  });
  it("no acepta fechas futuras ni regreso anterior a la lesión", () => {
    expect(validateInjury({ ...ok, occurred_on: "2026-11-03" }, today, consent)).toMatch(/futura/);
    expect(validateInjury({ ...ok, expected_return: "2026-10-01" }, today, consent)).toMatch(/posterior/);
  });
  it("exige zona y tipo válidos", () => {
    expect(validateInjury({ ...ok, body_region: "" }, today, consent)).toMatch(/zona/);
    expect(validateInjury({ ...ok, injury_type: "x" }, today, consent)).toMatch(/tipo/);
  });
});
