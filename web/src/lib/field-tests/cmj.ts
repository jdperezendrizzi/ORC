// CMJ: altura a partir del tiempo de vuelo (h = g·t²/8) y marcado por video.

/** Altura en cm a partir del tiempo de vuelo en segundos. */
export const heightFromFlight = (flightS: number, g = 9.81) => ((g * flightS * flightS) / 8) * 100;

/** Tiempo de vuelo en segundos entre dos cuadros. */
export const flightFromFrames = (takeoffFrame: number, landingFrame: number, fps: number) => (landingFrame - takeoffFrame) / fps;

/** Momento (ms) para pedir la imagen del cuadro n: el CENTRO del cuadro. */
export const frameTimeMs = (n: number, fps: number) => ((n + 0.5) / fps) * 1000;

/** Cantidad de cuadros de un video (la duración sale de los metadatos del archivo). */
export const frameCount = (durationMs: number, fps: number) => Math.floor((durationMs / 1000) * fps);

/**
 * Precisión: cuánto cambia la altura si cualquiera de las dos marcas se
 * corre un cuadro (el peor caso de ±1 cuadro en la duración del vuelo).
 */
export function cmjPrecisionCm(takeoffFrame: number, landingFrame: number, fps: number, g = 9.81): number {
  const n = landingFrame - takeoffFrame;
  const h = heightFromFlight(n / fps, g);
  return Math.max(Math.abs(heightFromFlight((n + 1) / fps, g) - h), Math.abs(heightFromFlight((n - 1) / fps, g) - h));
}

export interface CmjVideoState {
  takeoff: number | null;
  landing: number | null;
  fps: number;
  g?: number;
}

/** Lo que se muestra en vivo mientras se marca. */
export function cmjLive(s: CmjVideoState): { flightMs: number; heightCm: number; precisionCm: number } | null {
  if (s.takeoff === null || s.landing === null || s.landing <= s.takeoff) return null;
  const t = flightFromFrames(s.takeoff, s.landing, s.fps);
  return {
    flightMs: t * 1000,
    heightCm: heightFromFlight(t, s.g),
    precisionCm: cmjPrecisionCm(s.takeoff, s.landing, s.fps, s.g),
  };
}
