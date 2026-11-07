// Tiempos de captura de un video importado (cámara lenta).
//   * La tasa de la línea de tiempo sale del intervalo MEDIANO entre cuadros.
//   * Si más del 5 % de los intervalos se aleja de la mediana, el video
//     mezcla velocidades y se rechaza.
//   * Si la tasa de captura de los metadatos es mayor que la de la línea de
//     tiempo, el archivo fue reajustado para verse lento: se mide con la de
//     captura y el cuadro se pide en (tiempo de captura × escala).

export const STANDARD_FPS = [24, 25, 30, 48, 50, 60, 90, 100, 120, 240, 480, 960];
export const MAX_OUTLIER_SHARE = 0.05;
/** Cuánto puede alejarse un intervalo de la mediana sin contar como distinto. */
export const INTERVAL_TOLERANCE = 0.25;

export type TimingRejection = "too_short" | "variable_rate" | "low_fps";

export interface VideoTiming {
  ok: boolean;
  reason?: TimingRejection;
  message?: string;
  fps: number; // tasa de captura (la que se usa para medir)
  timelineFps: number;
  timelineScale: number; // segundos de línea de tiempo por segundo de captura
  frameCount: number;
  medianInterval: number;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Redondea a la tasa estándar más cercana si está a menos de 3 %. */
export function roundFps(fps: number): number {
  const near = STANDARD_FPS.reduce((a, b) => (Math.abs(b - fps) < Math.abs(a - fps) ? b : a));
  return Math.abs(near - fps) / near <= 0.03 ? near : Math.round(fps * 10) / 10;
}

export function analyzeTiming(ptsSec: number[], captureFps: number | null, minFps: number): VideoTiming {
  const base = { fps: 0, timelineFps: 0, timelineScale: 1, frameCount: ptsSec.length, medianInterval: 0 };
  if (ptsSec.length < 10) return { ...base, ok: false, reason: "too_short", message: "El video es demasiado corto." };
  const iv: number[] = [];
  for (let i = 1; i < ptsSec.length; i++) iv.push(ptsSec[i] - ptsSec[i - 1]);
  const med = median(iv);
  const outliers = iv.filter((d) => Math.abs(d - med) > med * INTERVAL_TOLERANCE).length;
  const timelineFps = 1 / med;
  const out = { ...base, timelineFps, medianInterval: med };
  if (outliers / iv.length > MAX_OUTLIER_SHARE) {
    return {
      ...out,
      fps: roundFps(timelineFps),
      ok: false,
      reason: "variable_rate",
      message: "El video mezcla velocidades (tramos lentos y normales). Exportalo entero en cámara lenta o grabalo de nuevo.",
    };
  }
  let fps = roundFps(timelineFps);
  let timelineScale = 1;
  if (captureFps && captureFps > timelineFps * 1.05) {
    fps = roundFps(captureFps);
    timelineScale = captureFps * med; // con el intervalo medido, no con la tasa redondeada
  }
  if (fps < minFps) {
    return {
      ...out,
      fps,
      timelineScale,
      ok: false,
      reason: "low_fps",
      message: `El video tiene ${Math.round(fps)} cuadros por segundo y hacen falta al menos ${minFps}. Filmá en cámara lenta (ideal 240).`,
    };
  }
  return { ...out, ok: true, fps, timelineScale };
}

/**
 * Momento de la línea de tiempo (s) para mostrar el cuadro n: el centro del
 * cuadro, usando el tiempo real de ese cuadro en el archivo.
 */
export function mediaTimeForFrame(n: number, ptsSec: number[], medianInterval: number): number {
  const i = Math.max(0, Math.min(ptsSec.length - 1, Math.round(n)));
  return ptsSec[i] + medianInterval / 2;
}
