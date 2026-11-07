// Entradas crudas de un intento → métricas. Espejo de
// private.attempt_metrics (la base guarda; esto es la vista en vivo).
// parity.test.ts verifica que den lo mismo.

import { heightFromFlight } from "./cmj";
import type { FieldTestCode, MeasureMethod } from "./protocol";
import { vift } from "./ift";
import { DEFAULT_PARAMS } from "./protocol";

export class AttemptInputError extends Error {}
const fail = (msg: string): never => {
  throw new AttemptInputError(msg);
};

type Inputs = Record<string, unknown>;
const num = (i: Inputs, k: string) => (i[k] == null ? null : Number(i[k]));
function positive(i: Inputs, k: string, required = true): number | null {
  const v = num(i, k);
  if (v === null) return required ? fail(`Falta "${k}"`) : null;
  if (!(v > 0)) fail(`"${k}" tiene que ser mayor que cero`);
  return v;
}
function frame(i: Inputs, k: string, required = true): number | null {
  const v = num(i, k);
  if (v === null) return required ? fail(`Falta el cuadro "${k}"`) : null;
  if (v < 0 || !Number.isInteger(v)) fail(`El cuadro "${k}" tiene que ser un entero ≥ 0`);
  return v;
}

export interface MetricValue {
  code: string;
  value: number;
}

export function attemptMetrics(test: FieldTestCode, method: MeasureMethod, inputs: Inputs, params: Record<string, unknown>): MetricValue[] {
  const g = Number(params.g ?? 9.81);
  let fps = 0;
  if (method === "video") {
    fps = positive(inputs, "frameRateFps")!;
    const min = Number(params.min_fps ?? 120);
    if (fps < min) fail(`El video tiene ${Math.round(fps)} fps: el mínimo es ${min}`);
  }
  switch (test) {
    case "cmj": {
      let t: number;
      if (method === "video") {
        const a = frame(inputs, "takeoffFrame")!;
        const b = frame(inputs, "landingFrame")!;
        if (b <= a) fail("El aterrizaje tiene que ser después del despegue");
        t = (b - a) / fps;
      } else if (inputs.flightMs != null) {
        t = positive(inputs, "flightMs")! / 1000;
      } else {
        return [{ code: "cmj_height_cm", value: positive(inputs, "heightCm")! }];
      }
      return [{ code: "cmj_height_cm", value: heightFromFlight(t, g) }];
    }
    case "sprint_40": {
      let t10: number | null, t20: number, t40: number;
      if (method === "video") {
        const f0 = frame(inputs, "startFrame")!;
        const f10 = frame(inputs, "frame10", false);
        const f20 = frame(inputs, "frame20")!;
        const f40 = frame(inputs, "frame40")!;
        if ((f10 !== null && (f10 <= f0 || f20 <= f10)) || f20 <= f0 || f40 <= f20) fail("Los cuadros tienen que ir en orden: salida < 10 m < 20 m < 40 m");
        t10 = f10 === null ? null : (f10 - f0) / fps;
        t20 = (f20 - f0) / fps;
        t40 = (f40 - f0) / fps;
      } else {
        t10 = positive(inputs, "t10", false);
        t20 = positive(inputs, "t20")!;
        t40 = positive(inputs, "t40")!;
        if ((t10 !== null && t20 <= t10) || t40 <= t20) fail("Los tiempos tienen que crecer: 10 m < 20 m < 40 m");
      }
      return [
        ...(t10 === null ? [] : [{ code: "sprint_10m_s", value: t10 }]),
        { code: "sprint_20m_s", value: t20 },
        { code: "sprint_40m_s", value: t40 },
        { code: "sprint_vmax_ms", value: 20 / (t40 - t20) },
      ];
    }
    case "ift_30_15": {
      const stage = num(inputs, "lastStage");
      if (stage === null) fail("Falta la última etapa completa");
      const p = { ...DEFAULT_PARAMS.ift_30_15, ...(params as object) };
      if ((stage as number) < 0 || (stage as number) > p.max_stage) fail("Etapa fuera del protocolo");
      const v = vift(Math.trunc(stage as number), p);
      return v === null ? [] : [{ code: "ift_vift_kmh", value: v }];
    }
    case "reaction": {
      const mode = (inputs.mode as string) ?? "simple";
      if (mode !== "simple" && mode !== "gonogo") fail("Modo de reacción desconocido");
      const code = mode === "gonogo" ? "reaction_gonogo_ms" : "reaction_time_ms";
      if (inputs.meanMs != null) return [{ code, value: positive(inputs, "meanMs")! }];
      if (!Array.isArray(inputs.trials)) fail("Faltan los estímulos");
      const valid = (inputs.trials as { outcome: string; rtMs: number; practice?: boolean }[]).filter((x) => x.outcome === "valid" && !x.practice);
      const need = Number(params.valid ?? 5);
      if (valid.length < need) fail(`Serie incompleta: ${valid.length} de ${need} estímulos válidos`);
      return [{ code, value: Math.round(valid.reduce((a, x) => a + Number(x.rtMs), 0) / valid.length) }];
    }
  }
}

/** Mejor intento según el sentido de la métrica. */
export function bestOf(values: number[], higherIsBetter: boolean): number | null {
  if (!values.length) return null;
  return higherIsBetter ? Math.max(...values) : Math.min(...values);
}
