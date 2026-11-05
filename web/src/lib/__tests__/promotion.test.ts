import { describe, expect, it } from "vitest";
import { aboveMedianCount, nextCategory, seasonImprovement, standing } from "../promotion";
import type { Category } from "../types";

const cat = (id: string, sort_order: number): Category => ({ id, code: id, name: id, level: "juveniles", sort_order });

describe("ficha de pase", () => {
  it("categoría siguiente por orden", () => {
    const cats = [cat("M19", 60), cat("M17", 50), cat("PRIMERA", 100), cat("INTERMEDIA", 90)];
    expect(nextCategory(cats, "M17")?.id).toBe("M19");
    expect(nextCategory(cats, "M19")?.id).toBe("INTERMEDIA");
    expect(nextCategory(cats, "PRIMERA")).toBeNull();
  });

  it("posición respecto de la referencia (más es mejor)", () => {
    const b = { n: 10, p25: 40, p50: 45, p75: 50 };
    expect(standing(52, b, true)).toBe("top");
    expect(standing(45, b, true)).toBe("above");
    expect(standing(41, b, true)).toBe("range");
    expect(standing(38, b, true)).toBe("below");
  });

  it("posición respecto de la referencia (menos es mejor: sprint)", () => {
    const b = { n: 10, p25: 1.8, p50: 1.85, p75: 1.9 };
    expect(standing(1.78, b, false)).toBe("top");
    expect(standing(1.82, b, false)).toBe("above");
    expect(standing(1.88, b, false)).toBe("range");
    expect(standing(1.95, b, false)).toBe("below");
  });

  it("mejora de la temporada con signo «bueno»", () => {
    expect(seasonImprovement(40, 44, true)).toBe(10);
    expect(seasonImprovement(1.9, 1.81, false)).toBe(4.7);
    expect(seasonImprovement(0, 1, true)).toBeNull();
  });

  it("conteo por encima de la mediana", () => {
    expect(aboveMedianCount(["top", "above", "range", null, "below"])).toEqual({ above: 2, total: 4 });
  });
});
