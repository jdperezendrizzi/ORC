// Sincronización de la outbox con Supabase.
//
// * Orden: sesiones → resultados → bienestar → lesiones → objetivos (por las FK).
// * Upsert por lotes con onConflict=id (idempotente).
// * Si un lote falla por validación, se reintenta fila por fila para aislar
//   la fila problemática y dejar pasar el resto.
// * Errores de red / servidor / sesión vencida => quedan pendientes.
//   Errores de datos (consentimiento, rango, permisos) => quedan en "error"
//   con un mensaje entendible para el profe.

import type { OutboxItem, OutboxTable } from "./db";
import { listOutbox, removeOutbox, updateOutbox } from "./outbox";

export interface UpsertError {
  message: string;
  code?: string;
  hint?: string | null;
  details?: string | null;
}

/** Lo mínimo que necesita el sync (permite testear sin Supabase). */
export type Uploader = (
  table: OutboxTable,
  rows: Record<string, unknown>[],
) => Promise<{ error: UpsertError | null }>;

const TABLE_ORDER: OutboxTable[] = ["evaluation_sessions", "results", "wellness_logs", "injuries", "objective_checks"];
const BATCH_SIZE = 200;

export interface SyncReport {
  synced: number;
  failed: number;
  pending: number;
}

let running: Promise<SyncReport> | null = null;

/** Ejecuta un sync (si ya hay uno en curso, devuelve ese). */
export function syncOutbox(upload: Uploader): Promise<SyncReport> {
  if (!running) {
    running = doSync(upload).finally(() => {
      running = null;
    });
  }
  return running;
}

async function doSync(upload: Uploader): Promise<SyncReport> {
  const report: SyncReport = { synced: 0, failed: 0, pending: 0 };
  const all = (await listOutbox()).filter((i) => i.status === "pending");

  for (const table of TABLE_ORDER) {
    const items = all.filter((i) => i.table === table);
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      const { error } = await upload(table, batch.map((b) => b.row));

      if (!error) {
        await removeOutbox(batch.map((b) => b.key));
        report.synced += batch.length;
        continue;
      }
      if (isTransient(error)) {
        // Sin red / servidor caído: se corta y se reintenta más tarde.
        await bumpAttempts(batch);
        report.pending += items.length - i + countAfter(all, table);
        return report;
      }
      // Error de datos en el lote: fila por fila.
      for (const item of batch) {
        const single = await upload(table, [item.row]);
        if (!single.error) {
          await removeOutbox([item.key]);
          report.synced++;
        } else if (isTransient(single.error)) {
          await bumpAttempts([item]);
          report.pending++;
        } else {
          await updateOutbox([
            { ...item, status: "error", error: friendlyError(single.error), attempts: item.attempts + 1, updatedAt: Date.now() },
          ]);
          report.failed++;
        }
      }
    }
  }
  return report;
}

function countAfter(all: OutboxItem[], table: OutboxTable): number {
  const idx = TABLE_ORDER.indexOf(table);
  return all.filter((i) => TABLE_ORDER.indexOf(i.table) > idx).length;
}

async function bumpAttempts(items: OutboxItem[]) {
  await updateOutbox(items.map((i) => ({ ...i, attempts: i.attempts + 1 })));
}

/** ¿Vale la pena reintentar sin que el usuario cambie nada? */
export function isTransient(error: UpsertError): boolean {
  const code = error.code ?? "";
  if (code === "") return true; // fetch falló (sin red)
  if (code.startsWith("PGRST3")) return true; // JWT vencido / auth
  if (code === "08006" || code === "57014" || code === "53300") return true; // conexión, timeout, saturación
  return /failed to fetch|network|load failed|timeout/i.test(error.message);
}

/** Traduce errores de la base (triggers / RLS) a mensajes para la cancha. */
export function friendlyError(error: UpsertError): string {
  const msg = error.message ?? "";
  if (error.hint === "consent_required" || /consentimiento/i.test(msg)) {
    return "Falta el consentimiento firmado. Avisale al admin del club.";
  }
  if (error.hint === "out_of_range" || /fuera de rango/i.test(msg)) {
    return msg.replace(/^.*?Valor/, "Valor");
  }
  if (error.code === "42501" || /row-level security/i.test(msg)) {
    return "No tenés permiso para cargar en esta categoría.";
  }
  if (error.code === "23503") {
    return "La sesión o el jugador ya no existen (¿se borró la sesión?).";
  }
  if (error.code === "23505") {
    return "Ya existe un registro para ese jugador/fecha cargado desde otro dispositivo.";
  }
  return msg || "Error desconocido";
}
