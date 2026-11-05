import { describe, expect, it } from "vitest";
import { canEdit, canView, effectiveModules, roleMax } from "../modules";

describe("permisos por módulo", () => {
  it("valores por defecto = lo que el rol podía antes", () => {
    const coach = effectiveModules("coach", true);
    expect(Object.values(coach).every((l) => l === "edit")).toBe(true);
    const med = effectiveModules("medical", true);
    expect(med).toMatchObject({ performance: "view", attendance: "view", objectives: "none", promotion: "view", injuries: "edit", sharing: "edit", insights: "edit", wellness: "edit" });
  });

  it("sólo se restringe; no se sube por encima del rol; el admin tiene todo", () => {
    expect(effectiveModules("coach", true, { injuries: "none", attendance: "view" })).toMatchObject({ injuries: "none", attendance: "view", wellness: "edit" });
    expect(effectiveModules("medical", true, { objectives: "edit", performance: "edit" })).toMatchObject({ objectives: "none", performance: "view" });
    expect(effectiveModules("admin", true, { injuries: "none" }).injuries).toBe("edit");
    expect(effectiveModules("coach", false).wellness).toBe("none");
    expect(roleMax("guardian", "wellness")).toBe("none");
  });

  it("ver / cargar", () => {
    const m = effectiveModules("coach", true, { injuries: "view", sharing: "none" });
    expect([canView(m, "injuries"), canEdit(m, "injuries"), canView(m, "sharing"), canEdit(null, "wellness")]).toEqual([true, false, false, false]);
  });
});
