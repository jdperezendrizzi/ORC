// Almacenamiento local (IndexedDB) para trabajar sin señal.
//   cache  : datos de referencia descargados (catálogo, planteles, sesiones)
//   outbox : cambios pendientes de subir a Supabase

import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export type OutboxTable = "evaluation_sessions" | "results" | "wellness_logs" | "injuries";

export interface OutboxItem {
  /** `${table}:${row.id}` — una edición posterior del mismo registro reemplaza la pendiente. */
  key: string;
  table: OutboxTable;
  row: Record<string, unknown> & { id: string };
  status: "pending" | "error";
  error?: string;
  attempts: number;
  createdAt: number;
  updatedAt: number;
}

export interface CacheEntry<T = unknown> {
  key: string;
  data: T;
  updatedAt: number;
}

interface OrcDB extends DBSchema {
  cache: { key: string; value: CacheEntry };
  outbox: { key: string; value: OutboxItem; indexes: { by_table: string; by_status: string } };
}

const DB_NAME = "orc-offline";
let dbPromise: Promise<IDBPDatabase<OrcDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<OrcDB>> {
  if (!dbPromise) {
    dbPromise = openDB<OrcDB>(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore("cache", { keyPath: "key" });
        const outbox = db.createObjectStore("outbox", { keyPath: "key" });
        outbox.createIndex("by_table", "table");
        outbox.createIndex("by_status", "status");
      },
    });
  }
  return dbPromise;
}

export async function cacheGet<T>(key: string): Promise<CacheEntry<T> | undefined> {
  return (await (await getDB()).get("cache", key)) as CacheEntry<T> | undefined;
}

export async function cachePut<T>(key: string, data: T): Promise<void> {
  await (await getDB()).put("cache", { key, data, updatedAt: Date.now() });
}

/** Borra todo (al cerrar sesión: el celular puede ser compartido). */
export async function clearLocalData(): Promise<void> {
  const db = await getDB();
  await Promise.all([db.clear("cache"), db.clear("outbox")]);
}

/** Sólo para tests. */
export function __resetDBForTests() {
  dbPromise = null;
}
