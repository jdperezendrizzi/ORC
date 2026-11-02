"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { OutboxItem } from "@/lib/offline/db";
import { listOutbox, onOutboxChange } from "@/lib/offline/outbox";
import { syncOutbox, type Uploader } from "@/lib/offline/sync";

interface SyncState {
  online: boolean;
  syncing: boolean;
  items: OutboxItem[];
  pending: number;
  errors: number;
  lastSyncAt: number | null;
  syncNow: () => Promise<void>;
}

const SyncContext = createContext<SyncState | null>(null);

const SYNC_INTERVAL_MS = 30_000;

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const busy = useRef(false);

  const reload = useCallback(async () => setItems(await listOutbox()), []);

  const syncNow = useCallback(async () => {
    if (busy.current || !navigator.onLine) return;
    busy.current = true;
    setSyncing(true);
    try {
      const supabase = supabaseBrowser();
      const upload: Uploader = async (table, rows) => {
        try {
          // Lesiones: el profe sólo puede crearlas (no editarlas), así que el
          // reenvío usa ON CONFLICT DO NOTHING (no requiere permiso de edición).
          const { error } = await supabase
            .from(table)
            .upsert(rows, { onConflict: "id", ignoreDuplicates: table === "injuries" });
          return { error: error ? { message: error.message, code: error.code, hint: error.hint, details: error.details } : null };
        } catch (e) {
          return { error: { message: e instanceof Error ? e.message : String(e) } };
        }
      };
      await syncOutbox(upload);
      setLastSyncAt(Date.now());
    } finally {
      busy.current = false;
      setSyncing(false);
      await reload();
    }
  }, [reload]);

  useEffect(() => {
    setOnline(navigator.onLine);
    void reload();
    const off = onOutboxChange(() => void reload());
    const goOnline = () => {
      setOnline(true);
      void syncNow();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    const timer = window.setInterval(() => void syncNow(), SYNC_INTERVAL_MS);
    void syncNow();
    return () => {
      off();
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.clearInterval(timer);
    };
  }, [reload, syncNow]);

  // Sincroniza enseguida cuando aparece algo nuevo en la outbox.
  const pending = items.filter((i) => i.status === "pending").length;
  useEffect(() => {
    if (pending > 0 && online) {
      const t = window.setTimeout(() => void syncNow(), 1500);
      return () => window.clearTimeout(t);
    }
  }, [pending, online, syncNow]);

  const value = useMemo<SyncState>(
    () => ({
      online,
      syncing,
      items,
      pending,
      errors: items.filter((i) => i.status === "error").length,
      lastSyncAt,
      syncNow,
    }),
    [online, syncing, items, pending, lastSyncAt, syncNow],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncState {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync fuera de <SyncProvider>");
  return ctx;
}
