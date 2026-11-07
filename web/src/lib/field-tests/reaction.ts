// Test de reacción (simple y go/no-go). Lógica pura con semilla inyectable.

import type { ReactionParams } from "./protocol";

export type ReactionMode = "simple" | "gonogo";
export type StimulusKind = "go" | "nogo";
export type Outcome = "valid" | "anticipation" | "lapse" | "commission" | "correct_rejection";

export interface Trial {
  kind: StimulusKind;
  practice: boolean;
  waitMs: number;
  outcome: Outcome;
  rtMs: number | null;
}

/** Generador pseudoaleatorio reproducible (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SeriesState {
  mode: ReactionMode;
  trials: Trial[];
  /** Estímulo a repetir (después de una anticipación o un lapso). */
  repeat: { kind: StimulusKind; practice: boolean } | null;
}

export const newSeries = (mode: ReactionMode): SeriesState => ({ mode, trials: [], repeat: null });

const practiceDone = (s: SeriesState) => s.trials.filter((t) => t.practice && countsAsDone(t)).length;
const countsAsDone = (t: Trial) => t.outcome !== "anticipation" && t.outcome !== "lapse";
export const validCount = (s: SeriesState) => s.trials.filter((t) => !t.practice && t.outcome === "valid").length;
export const scoredCount = (s: SeriesState) => s.trials.filter((t) => !t.practice).length;

export type SeriesStatus = "running" | "complete" | "incomplete";
export function seriesStatus(s: SeriesState, p: ReactionParams): SeriesStatus {
  if (validCount(s) >= p.valid) return "complete";
  // Tope de estímulos puntuados; también corta una práctica que nunca termina.
  if (scoredCount(s) >= p.max_scored || s.trials.length >= p.max_scored + 3 * p.practice) return "incomplete";
  return "running";
}

/** Próximo estímulo: tipo, si es de práctica y la espera al azar. */
export function nextStimulus(s: SeriesState, p: ReactionParams, rnd: () => number): { kind: StimulusKind; practice: boolean; waitMs: number } {
  const waitMs = Math.round(p.wait_min_ms + rnd() * (p.wait_max_ms - p.wait_min_ms));
  if (s.repeat) return { ...s.repeat, waitMs };
  const practice = practiceDone(s) < p.practice;
  if (s.mode === "simple") return { kind: "go", practice, waitMs };

  const done = s.trials.filter(countsAsDone);
  const prev = done.slice(-p.nogo_max_run);
  const runOfNogo = prev.length === p.nogo_max_run && prev.every((t) => t.kind === "nogo");
  let kind: StimulusKind;
  if (done.length === 0 || runOfNogo) kind = "go"; // nunca el primero; nunca más de N seguidos
  else if (practice && practiceDone(s) === p.practice - 1 && !s.trials.some((t) => t.practice && t.kind === "nogo")) kind = "nogo"; // al menos uno en la práctica
  else kind = rnd() * 100 < p.nogo_pct ? "nogo" : "go";
  return { kind, practice, waitMs };
}

/**
 * Cómo terminó un estímulo.
 * tapMs: momento del toque relativo a la aparición del estímulo (negativo =
 * durante la espera), o null si no tocó dentro de la ventana.
 */
export function classify(kind: StimulusKind, tapMs: number | null, p: ReactionParams): Outcome {
  if (tapMs !== null && tapMs < p.anticipation_ms) return "anticipation";
  if (kind === "go") return tapMs !== null && tapMs <= p.window_ms ? "valid" : "lapse";
  return tapMs !== null && tapMs <= p.window_ms ? "commission" : "correct_rejection";
}

/** Registra el estímulo; las anticipaciones y los lapsos se repiten. */
export function recordTrial(s: SeriesState, stim: { kind: StimulusKind; practice: boolean; waitMs: number }, tapMs: number | null, p: ReactionParams): SeriesState {
  const outcome = classify(stim.kind, tapMs, p);
  const trial: Trial = { ...stim, outcome, rtMs: outcome === "valid" ? Math.round(tapMs as number) : tapMs === null ? null : Math.round(tapMs) };
  return {
    ...s,
    trials: [...s.trials, trial],
    repeat: outcome === "anticipation" || outcome === "lapse" ? { kind: stim.kind, practice: stim.practice } : null,
  };
}

/** Resultado: promedio de los válidos en ms enteros; los errores van en las notas. */
export function seriesResult(s: SeriesState): { meanMs: number | null; notes: string } {
  const valid = s.trials.filter((t) => !t.practice && t.outcome === "valid").map((t) => t.rtMs as number);
  const count = (o: Outcome) => s.trials.filter((t) => !t.practice && t.outcome === o).length;
  const parts = [
    count("anticipation") && `${count("anticipation")} anticipaciones`,
    count("lapse") && `${count("lapse")} sin respuesta`,
    count("commission") && `${count("commission")} toques en "No toques"`,
  ].filter(Boolean);
  return {
    meanMs: valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : null,
    notes: parts.length ? `Errores: ${parts.join(", ")}.` : "Sin errores.",
  };
}
