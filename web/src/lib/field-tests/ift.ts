// 30-15 IFT (Buchheit 2008): cronograma de señales y marcas del staff.
// Todo en ms enteros desde el inicio de la etapa 1 (la entrada previa es negativa).

import type { IftParams } from "./protocol";

export type IftSignal = "countdown" | "start" | "line" | "end_run" | "end_test";

export interface IftEvent {
  t: number; // ms desde el inicio de la etapa 1
  kind: IftSignal;
  stage: number;
  /** Número de señal de línea en TODO el test (para contar faltas seguidas entre etapas). */
  lineIndex?: number;
}

export const stageMs = (p: IftParams) => (p.run_s + p.rest_s) * 1000;
export const stageStart = (stage: number, p: IftParams) => (stage - 1) * stageMs(p);
export const stageSpeedKmh = (stage: number, p: IftParams) => p.start_kmh + (stage - 1) * p.step_kmh;

/** VIFT con la última etapa completa (sin la etapa 1 completa no hay VIFT). */
export const vift = (lastCompletedStage: number, p: IftParams): number | null =>
  lastCompletedStage >= 1 ? stageSpeedKmh(lastCompletedStage, p) : null;

/** ms de la señal de la línea k (1, 2, …) dentro de una etapa a v km/h. */
export const lineOffsetMs = (k: number, speedKmh: number, lineEveryM: number) => Math.round((k * lineEveryM * 3600) / speedKmh);

/** Líneas que suenan en la carrera de una etapa (antes del fin de los 30 s). */
export function linesInStage(stage: number, p: IftParams): number {
  const v = stageSpeedKmh(stage, p);
  let k = 0;
  while (lineOffsetMs(k + 1, v, p.line_every_m) < p.run_s * 1000) k++;
  return k;
}

/** Cronograma completo hasta la etapa máxima (ordenado por tiempo). */
export function buildSchedule(p: IftParams, maxStage = p.max_stage): IftEvent[] {
  const out: IftEvent[] = [];
  let lineIndex = 0;
  for (let stage = 1; stage <= maxStage; stage++) {
    const t0 = stageStart(stage, p);
    for (let k = p.countdown_beeps; k >= 1; k--) out.push({ t: t0 - k * 1000, kind: "countdown", stage });
    out.push({ t: t0, kind: "start", stage });
    const v = stageSpeedKmh(stage, p);
    const n = linesInStage(stage, p);
    for (let k = 1; k <= n; k++) out.push({ t: t0 + lineOffsetMs(k, v, p.line_every_m), kind: "line", stage, lineIndex: ++lineIndex });
    out.push({ t: t0 + p.run_s * 1000, kind: stage === maxStage ? "end_test" : "end_run", stage });
  }
  return out.sort((a, b) => a.t - b.t);
}

export type IftPhase = { kind: "leadin" } | { kind: "run"; stage: number; inMs: number } | { kind: "rest"; stage: number; inMs: number };

export function phaseAt(t: number, p: IftParams): IftPhase {
  if (t < 0) return { kind: "leadin" };
  const stage = Math.floor(t / stageMs(p)) + 1;
  const within = t - stageStart(stage, p);
  return within < p.run_s * 1000 ? { kind: "run", stage, inMs: within } : { kind: "rest", stage, inMs: within - p.run_s * 1000 };
}

/**
 * Etapa completa si el jugador termina en el momento t:
 * n − 1 durante la carrera de la etapa n; n en la pausa siguiente (salvo en
 * sus primeros segundos de margen); 0 en la entrada previa.
 */
export function completedStageAt(t: number, p: IftParams): number {
  const ph = phaseAt(t, p);
  if (ph.kind === "leadin") return 0;
  if (ph.kind === "run") return ph.stage - 1;
  return ph.inMs < p.rest_grace_s * 1000 ? ph.stage - 1 : Math.min(ph.stage, p.max_stage);
}

// ---------------------------------------------------------------------
// Marcas del staff (reducer puro, con deshacer)
// ---------------------------------------------------------------------
export type IftMark =
  | { type: "miss"; playerId: string; lineIndex: number; stage: number }
  | { type: "finish"; playerId: string; t: number };

export interface IftPlayerState {
  status: "running" | "out";
  /** Etapa completa al salir (o null si sigue corriendo). */
  lastStage: number | null;
  misses: number[]; // índices de línea
  reason?: "misses" | "finished";
}

export interface IftRunState {
  players: Record<string, IftPlayerState>;
  marks: IftMark[];
}

export function initRun(playerIds: string[]): IftRunState {
  return { players: Object.fromEntries(playerIds.map((id) => [id, { status: "running", lastStage: null, misses: [] }])), marks: [] };
}

function apply(state: IftRunState, m: IftMark, p: IftParams): IftRunState {
  const pl = state.players[m.playerId];
  if (!pl || pl.status !== "running") return state;
  let next: IftPlayerState;
  if (m.type === "finish") {
    next = { ...pl, status: "out", lastStage: completedStageAt(m.t, p), reason: "finished" };
  } else {
    if (pl.misses.includes(m.lineIndex)) return state;
    const misses = [...pl.misses, m.lineIndex].sort((a, b) => a - b);
    const tail = misses.slice(-p.max_misses);
    const consecutive = tail.length === p.max_misses && tail.every((x, i) => i === 0 || x === tail[i - 1] + 1);
    next = consecutive
      ? { status: "out", lastStage: Math.max(0, m.stage - 1), misses, reason: "misses" }
      : { ...pl, misses };
  }
  return { players: { ...state.players, [m.playerId]: next }, marks: [...state.marks, m] };
}

export function markRun(state: IftRunState, m: IftMark, p: IftParams): IftRunState {
  return apply(state, m, p);
}

/** Deshacer: revierte la última marca (se recalcula desde el principio). */
export function undoRun(state: IftRunState, p: IftParams): IftRunState {
  const marks = state.marks.slice(0, -1);
  return marks.reduce((s, m) => apply(s, m, p), initRun(Object.keys(state.players)));
}

export const allOut = (s: IftRunState) => Object.values(s.players).every((x) => x.status === "out");

/** Resultado final: los que siguen corriendo quedan con la etapa completa al momento t. */
export function finalStages(s: IftRunState, t: number, p: IftParams): Record<string, { lastStage: number; reason: string }> {
  const done = completedStageAt(t, p);
  return Object.fromEntries(
    Object.entries(s.players).map(([id, x]) => [id, x.status === "out" ? { lastStage: x.lastStage ?? 0, reason: x.reason ?? "finished" } : { lastStage: done, reason: "end" }]),
  );
}

/** Última señal de línea sonada hasta t (a ella se asigna "No llegó"). */
export function lastLineBefore(schedule: IftEvent[], t: number): IftEvent | null {
  let last: IftEvent | null = null;
  for (const e of schedule) {
    if (e.t > t) break;
    if (e.kind === "line") last = e;
  }
  return last;
}
