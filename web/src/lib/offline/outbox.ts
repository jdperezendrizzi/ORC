import { getDB, type OutboxItem, type OutboxTable } from "./db";

// Notificación a la UI (mismo tab) cuando cambia la outbox.
const listeners = new Set<() => void>();
export function onOutboxChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function notifyOutbox() {
  listeners.forEach((fn) => fn());
}

/** Encola (o reemplaza) un cambio. Una edición del mismo registro pisa la anterior. */
export async function enqueue(table: OutboxTable, row: OutboxItem["row"]): Promise<void> {
  const db = await getDB();
  const key = `${table}:${row.id}`;
  const prev = await db.get("outbox", key);
  const now = Date.now();
  await db.put("outbox", {
    key,
    table,
    row: { ...(prev?.row ?? {}), ...row },
    status: "pending",
    attempts: 0,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
  });
  notifyOutbox();
}

export async function listOutbox(): Promise<OutboxItem[]> {
  const items = await (await getDB()).getAll("outbox");
  return items.sort((a, b) => a.createdAt - b.createdAt);
}

export async function removeOutbox(keys: string[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("outbox", "readwrite");
  await Promise.all([...keys.map((k) => tx.store.delete(k)), tx.done]);
  notifyOutbox();
}

export async function updateOutbox(items: OutboxItem[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("outbox", "readwrite");
  await Promise.all([...items.map((i) => tx.store.put(i)), tx.done]);
  notifyOutbox();
}

/** Descarta un cambio con error (el usuario decide no reintentarlo). */
export async function discardOutbox(key: string): Promise<void> {
  await removeOutbox([key]);
}

/** Estado de una celda/registro para mostrar en la UI. */
export async function outboxStatusByKey(): Promise<Map<string, OutboxItem>> {
  const items = await listOutbox();
  return new Map(items.map((i) => [i.key, i]));
}
