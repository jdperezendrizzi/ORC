import { describe, expect, it } from "vitest";
import { categoryForAge, proposeCategory, type RolloverCategory } from "../rollover";
import { effectiveModules } from "../modules";

const cats: RolloverCategory[] = [
  { id: "M15", name: "M15", sort_order: 30, max_age: 15 },
  { id: "M16", name: "M16", sort_order: 40, max_age: 16 },
  { id: "M17", name: "M17", sort_order: 50, max_age: 17 },
  { id: "M19", name: "M19", sort_order: 60, max_age: 19 },
  { id: "PRIMERA", name: "Primera", sort_order: 100, max_age: null },
  { id: "INTERMEDIA", name: "Intermedia", sort_order: 90, max_age: null },
];

describe("pase de temporada", () => {
  it("categoría por edad (año de la temporada − año de nacimiento)", () => {
    expect(categoryForAge(cats, "2011-08-01", 2027)?.id).toBe("M16"); // cumple 16 en 2027
    expect(categoryForAge(cats, "2010-02-01", 2027)?.id).toBe("M17");
    expect(categoryForAge(cats, "2009-02-01", 2027)?.id).toBe("M19"); // 18 → M19
    expect(categoryForAge(cats, "2007-05-01", 2027)?.id).toBe("INTERMEDIA"); // 20 → plantel superior
  });

  const base = { categories: cats, currentCategoryId: "M15", birthDate: "2011-08-01", seasonYear: 2027, nextCategoryId: "M16" };
  it("la decisión de la ficha manda; si no, por edad", () => {
    expect(proposeCategory({ ...base, decision: null, decisionTargetId: null })).toEqual({ categoryId: "M16", reason: "age" });
    expect(proposeCategory({ ...base, decision: "stay", decisionTargetId: null })).toEqual({ categoryId: "M15", reason: "decision_stay" });
    expect(proposeCategory({ ...base, decision: "promote", decisionTargetId: "M17" })).toEqual({ categoryId: "M17", reason: "decision_promote" });
    expect(proposeCategory({ ...base, decision: "promote", decisionTargetId: null })).toEqual({ categoryId: "M16", reason: "decision_promote" });
    expect(proposeCategory({ ...base, decision: "observe", decisionTargetId: null })).toEqual({ categoryId: "M16", reason: "observe" });
  });

  it("permiso: apagado por defecto; el admin lo habilita sólo a profes", () => {
    expect(effectiveModules("coach", true).season_rollover).toBe("none");
    expect(effectiveModules("coach", true, { season_rollover: "edit" }).season_rollover).toBe("edit");
    expect(effectiveModules("medical", true, { season_rollover: "edit" }).season_rollover).toBe("none");
    expect(effectiveModules("admin", true).season_rollover).toBe("edit");
  });
});
