// Sprint 10/20/40 m por video (foto-finish con un solo celular).

export interface SprintFrames {
  startFrame: number;
  frame10?: number | null;
  frame20: number;
  frame40: number;
}

export const vmax = (t20: number, t40: number) => 20 / (t40 - t20);

export function sprintTimes(f: SprintFrames, fps: number): { t10: number | null; t20: number; t40: number; vmax: number } {
  const t = (x: number) => (x - f.startFrame) / fps;
  const t20 = t(f.frame20);
  const t40 = t(f.frame40);
  return { t10: f.frame10 == null ? null : t(f.frame10), t20, t40, vmax: vmax(t20, t40) };
}

/** Precisión de cada tiempo: ±1 cuadro. */
export const timePrecisionS = (fps: number) => 1 / fps;

/** Precisión de la Vmax: ±(v(Δt − 1 cuadro) − v(Δt + 1 cuadro)) / 2. */
export function vmaxPrecision(t20: number, t40: number, fps: number): number {
  const dt = t40 - t20;
  return (20 / (dt - 1 / fps) - 20 / (dt + 1 / fps)) / 2;
}

/** ¿Los cuadros marcados son válidos? (enteros ≥ 0, estrictamente crecientes) */
export function sprintFramesError(f: Partial<SprintFrames>): string | null {
  const seq = [f.startFrame, f.frame10, f.frame20, f.frame40];
  if (f.startFrame == null || f.frame20 == null || f.frame40 == null) return "Faltan marcas: salida, 20 m y 40 m son obligatorias.";
  const present = seq.filter((x): x is number => x != null);
  if (present.some((x) => !Number.isInteger(x) || x < 0)) return "Los cuadros tienen que ser enteros ≥ 0.";
  for (let i = 1; i < present.length; i++) if (present[i] <= present[i - 1]) return "Las marcas tienen que ir en orden: salida < 10 m < 20 m < 40 m.";
  return null;
}

// ---------------------------------------------------------------------
// Armado: celular frente a los 20 m a distancia D del carril; conos a P m
// detrás del carril (del lado de enfrente) corregidos por paralaje.
// ---------------------------------------------------------------------
export const SPRINT_LINES = [0, 10, 20, 40] as const;
const deg = (rad: number) => (rad * 180) / Math.PI;

/** Campo de visión que hace falta para ver de 0 a 40 m desde los 20 m. */
export const fovNeededDeg = (distanceM: number, halfSpanM = 20) => 2 * deg(Math.atan(halfSpanM / distanceM));

/** Ángulo de una línea respecto de la perpendicular del celular. */
export const lineAngleDeg = (lineM: number, cameraAtM: number, distanceM: number) => deg(Math.atan(Math.abs(lineM - cameraAtM) / distanceM));

/** Dónde va el cono de la línea x para que "alineado con su cono" = "cruzó la línea". */
export const conePosition = (lineM: number, cameraAtM: number, distanceM: number, offsetM: number) =>
  cameraAtM + ((lineM - cameraAtM) * (distanceM + offsetM)) / distanceM;

export interface SprintSetup {
  cones: { line: number; at: number; angle: number }[];
  fovNeeded: number;
  fits: boolean;
  warnings: string[];
}

export function sprintSetup(distanceM: number, offsetM: number, fovDeg = 60, maxAngleDeg = 55, cameraAtM = 20): SprintSetup {
  const cones = SPRINT_LINES.map((line) => ({
    line,
    at: conePosition(line, cameraAtM, distanceM, offsetM),
    angle: lineAngleDeg(line, cameraAtM, distanceM),
  }));
  const fovNeeded = fovNeededDeg(distanceM);
  const warnings: string[] = [];
  const fits = fovNeeded <= fovDeg;
  if (!fits) {
    warnings.push(
      `A ${distanceM} m hace falta ver ${Math.round(fovNeeded)}° y la cámara ve ${fovDeg}°: alejate o usá el gran angular.`,
    );
  }
  for (const c of cones) {
    if (c.angle > maxAngleDeg) {
      warnings.push(`La línea de ${c.line} m se ve muy de costado (${Math.round(c.angle)}°): ahí cada cuadro vale menos de un tercio del desplazamiento.`);
    }
  }
  return { cones, fovNeeded, fits, warnings };
}
