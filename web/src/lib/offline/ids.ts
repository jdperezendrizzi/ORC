// IDs deterministas (formato UUID v5) para la carga offline.
//
// El id de un resultado sale de su clave natural (sesión, jugador, métrica,
// intento) y el de un registro de bienestar de (jugador, fecha). Así:
//   * reenviar el mismo dato desde el celular es un upsert idempotente;
//   * corregir una celda pisa el mismo registro en vez de duplicarlo;
//   * dos celulares que cargan lo mismo no generan conflictos.

const NAMESPACE = "orc-rendimiento/v1";

export async function deterministicId(...parts: (string | number)[]): Promise<string> {
  const data = new TextEncoder().encode([NAMESPACE, ...parts].join("|"));
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-1", data)).slice(0, 16);
  hash[6] = (hash[6] & 0x0f) | 0x50; // versión 5
  hash[8] = (hash[8] & 0x3f) | 0x80; // variante RFC 4122
  const hex = Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const resultId = (sessionId: string, playerId: string, metricId: string, attempt: number) =>
  deterministicId("result", sessionId, playerId, metricId, attempt);

export const wellnessId = (playerId: string, date: string) => deterministicId("wellness", playerId, date);

/** Marca de un objetivo en una práctica: tachar/destachar el mismo día pisa la misma fila. */
export const objectiveCheckId = (objectiveId: string, date: string, playerId: string | null) =>
  deterministicId("objective", objectiveId, date, playerId ?? "equipo");

/** UUID aleatorio para entidades nuevas (sesiones creadas en la cancha). */
export const randomId = () => crypto.randomUUID();
