import { describe, expect, it } from "vitest";
import { niceAxis } from "@/components/player-charts";
import { formatValue } from "../validation";

describe("niceAxis", () => {
  it("rango chico de sprint: marcas distintas al formatear con 2 decimales", () => {
    const { ticks, domain } = niceAxis([1.76, 1.73, 1.73], 2);
    const labels = ticks.map((t) => formatValue(t, 2));
    expect(new Set(labels).size).toBe(labels.length);
    expect(domain[0]).toBeLessThan(1.73);
    expect(domain[1]).toBeGreaterThan(1.76);
  });
  it("rango grande (Yo-Yo en metros, sin decimales)", () => {
    const { ticks } = niceAxis([1240, 1680, 1450], 0);
    const labels = ticks.map((t) => formatValue(t, 0));
    expect(new Set(labels).size).toBe(labels.length);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    expect(ticks.length).toBeLessThanOrEqual(8);
  });
  it("valor único no rompe", () => {
    const { ticks } = niceAxis([42], 1);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
  });
});
