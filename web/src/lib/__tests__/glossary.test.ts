import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DOMAIN_INFO, METRIC_INFO, TEST_INFO } from "../glossary";

// Fuente de verdad: la migración del catálogo de tests.
const catalog = readFileSync(
  new URL("../../../../supabase/migrations/20261101000800_reference_catalog.sql", import.meta.url),
  "utf8",
);
const metricCodes = [...catalog.matchAll(/^\s*\('[a-z_0-9]+',\s*'([a-z_0-9]+)',/gm)].map((m) => m[1]);
const testCodes = [...catalog.matchAll(/^\s*\('([a-z_0-9]+)', '[^']+', '(anthropometry|strength|speed|power|agility|endurance|rugby)',/gm)].map(
  (m) => m[1],
);

describe("glosario", () => {
  it("lee el catálogo", () => {
    expect(metricCodes.length).toBe(41);
    expect(testCodes.length).toBe(15);
  });
  it("toda métrica del catálogo tiene explicación", () => {
    expect(metricCodes.filter((c) => !METRIC_INFO[c]?.what)).toEqual([]);
  });
  it("todo test y toda área tienen explicación", () => {
    expect(testCodes.filter((c) => !TEST_INFO[c])).toEqual([]);
    for (const d of ["anthropometry", "strength", "speed", "power", "agility", "endurance", "rugby"]) {
      expect(DOMAIN_INFO[d]).toBeTruthy();
    }
  });
});
