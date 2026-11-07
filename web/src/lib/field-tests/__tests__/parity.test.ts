// Las fórmulas del celular (vista en vivo) y las de la base (lo que se
// guarda) tienen que dar lo mismo. Corre contra Postgres si ORC_PGDB está
// definido (ej. "host=/var/tmp/orcpg port=54329 user=postgres dbname=orc_verify").
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { attemptMetrics } from "../metrics";
import { DEFAULT_PARAMS, type FieldTestCode, type MeasureMethod } from "../protocol";

const CASES: [FieldTestCode, MeasureMethod, Record<string, unknown>][] = [
  ["cmj", "manual", { flightMs: 500 }],
  ["cmj", "manual", { flightMs: 612.5 }],
  ["cmj", "app", { heightCm: 41.2 }],
  ["cmj", "video", { takeoffFrame: 100, landingFrame: 237, frameRateFps: 240 }],
  ["cmj", "video", { takeoffFrame: 7, landingFrame: 80, frameRateFps: 120 }],
  ["sprint_40", "video", { startFrame: 10, frame10: 430, frame20: 730, frame40: 1270, frameRateFps: 240 }],
  ["sprint_40", "video", { startFrame: 0, frame20: 701, frame40: 1233, frameRateFps: 240 }],
  ["sprint_40", "fotocelula", { t10: 1.81, t20: 3.05, t40: 5.33 }],
  ["ift_30_15", "app", { lastStage: 17 }],
  ["ift_30_15", "manual", { lastStage: 0 }],
  ["reaction", "app", { mode: "gonogo", trials: [{ outcome: "valid", rtMs: 301 }, { outcome: "valid", rtMs: 322 }, { outcome: "commission", rtMs: 280 }, { outcome: "valid", rtMs: 290 }, { outcome: "valid", rtMs: 311 }, { outcome: "valid", rtMs: 305 }] }],
];

const conn = process.env.ORC_PGDB;

describe.skipIf(!conn)("paridad celular ↔ base", () => {
  it("mismas métricas para los mismos datos", () => {
    for (const [test, method, inputs] of CASES) {
      const params = DEFAULT_PARAMS[test];
      const sql = `select coalesce(json_agg(json_build_object('code', metric_code, 'value', value) order by metric_code), '[]') from private.attempt_metrics('${test}', '${method}', '${JSON.stringify(inputs)}'::jsonb, '${JSON.stringify(params)}'::jsonb)`;
      const out = execFileSync("psql", [conn!, "-tAX", "-c", sql]).toString().trim();
      const db = (JSON.parse(out) as { code: string; value: number }[]).map((r) => [r.code, Number(r.value)]);
      const ts = attemptMetrics(test, method, inputs, params as unknown as Record<string, unknown>)
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((r) => [r.code, r.value]);
      expect(db.map((r) => r[0])).toEqual(ts.map((r) => r[0]));
      db.forEach((r, i) => expect(r[1] as number).toBeCloseTo(ts[i][1] as number, 6));
    }
  });
});
