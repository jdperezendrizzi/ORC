"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { loadCachedFieldData, refreshFieldData, type FieldData } from "@/lib/offline/field-data";

interface State {
  data: FieldData | null;
  updatedAt: number | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/** Datos de cancha: primero el cache local (instantáneo, offline), después la red. */
export function useFieldData(): State {
  const [data, setData] = useState<FieldData | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      const fresh = await refreshFieldData(supabaseBrowser());
      setData(fresh);
      setUpdatedAt(Date.now());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await loadCachedFieldData();
      if (!cancelled && cached) {
        setData(cached.data);
        setUpdatedAt(cached.updatedAt);
        setLoading(false);
      }
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  return { data, updatedAt, loading, error, refresh };
}
