// Parámetros de cada protocolo (vienen de test_protocols.params).
// Cambiar un parámetro = versión nueva del protocolo: los resultados viejos
// quedan con la versión con la que se midieron.

export type FieldTestCode = "cmj" | "sprint_40" | "ift_30_15" | "reaction";
export type MeasureMethod = "manual" | "video" | "app" | "fotocelula" | "historico";

export const methodLabel: Record<MeasureMethod, string> = {
  manual: "Manual",
  video: "Video",
  app: "App",
  fotocelula: "Fotocélula",
  historico: "Histórico",
};

export interface CmjParams {
  g: number;
  attempts: number;
  min_fps: number;
  preferred_fps: number;
  max_record_s: number;
  weekly: { baseline_days: number; min_days: number; warn_drop_pct: number; crit_drop_pct: number };
}
export interface SprintParams {
  attempts: number;
  rest_min: number;
  start_behind_m: number;
  min_fps: number;
  preferred_fps: number;
  camera_fov_deg: number;
  suggested_distance_m: number;
  max_line_angle_deg: number;
  cone_offset_m: number;
}
export interface IftParams {
  start_kmh: number;
  step_kmh: number;
  run_s: number;
  rest_s: number;
  shuttle_m: number;
  line_every_m: number;
  tolerance_m: number;
  max_stage: number;
  lead_in_s: number;
  countdown_beeps: number;
  max_misses: number;
  rest_grace_s: number;
  late_skip_ms: number;
}
export interface ReactionParams {
  valid: number;
  practice: number;
  wait_min_ms: number;
  wait_max_ms: number;
  anticipation_ms: number;
  window_ms: number;
  nogo_pct: number;
  nogo_max_run: number;
  max_scored: number;
}

export const DEFAULT_PARAMS = {
  cmj: {
    g: 9.81,
    attempts: 3,
    min_fps: 120,
    preferred_fps: 240,
    max_record_s: 8,
    weekly: { baseline_days: 42, min_days: 3, warn_drop_pct: 7, crit_drop_pct: 12 },
  } as CmjParams,
  sprint_40: {
    attempts: 3,
    rest_min: 3,
    start_behind_m: 0.5,
    min_fps: 120,
    preferred_fps: 240,
    camera_fov_deg: 60,
    suggested_distance_m: 35,
    max_line_angle_deg: 55,
    cone_offset_m: 2,
  } as SprintParams,
  ift_30_15: {
    start_kmh: 8,
    step_kmh: 0.5,
    run_s: 30,
    rest_s: 15,
    shuttle_m: 40,
    line_every_m: 20,
    tolerance_m: 3,
    max_stage: 40,
    lead_in_s: 10,
    countdown_beeps: 3,
    max_misses: 3,
    rest_grace_s: 2,
    late_skip_ms: 250,
  } as IftParams,
  reaction: {
    valid: 5,
    practice: 3,
    wait_min_ms: 1000,
    wait_max_ms: 3000,
    anticipation_ms: 100,
    window_ms: 1000,
    nogo_pct: 30,
    nogo_max_run: 2,
    max_scored: 20,
  } as ReactionParams,
};

/** Completa los parámetros guardados con los valores por defecto. */
export function withDefaults<K extends FieldTestCode>(code: K, params: unknown): (typeof DEFAULT_PARAMS)[K] {
  const base = DEFAULT_PARAMS[code] as unknown as Record<string, unknown>;
  const p = (params && typeof params === "object" ? params : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = { ...base, ...p };
  if (code === "cmj") out.weekly = { ...(base.weekly as object), ...((p.weekly as object) ?? {}) };
  return out as unknown as (typeof DEFAULT_PARAMS)[K];
}

/** Número escrito en la cancha: acepta coma decimal (es-AR). */
export function parseDecimal(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
