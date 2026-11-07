"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { FieldData } from "@/lib/offline/field-data";
import { hasConsent } from "@/lib/offline/field-data";
import {
  ensureFieldSession,
  fieldSessionId,
  loadCachedAttempts,
  nextAttemptNumber,
  refreshAttempts,
  saveAttempt,
  voidAttempt,
  type FieldSessionKind,
} from "@/lib/field-tests/client";
import { attemptMetrics, AttemptInputError, type MetricValue } from "@/lib/field-tests/metrics";
import { withDefaults, type FieldTestCode, type MeasureMethod } from "@/lib/field-tests/protocol";
import type { RosterPlayer, TestAttempt, TestAttemptVoid, TestMetric } from "@/lib/types";
import { formatValue } from "@/lib/validation";
import { useSync } from "../sync-provider";

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

export interface CheckResult {
  values: (MetricValue & { metric: TestMetric })[];
  /** Error que impide guardar (dato imposible o error de tipeo). */
  error: string | null;
  /** Avisos de rango esperable: se puede "Guardar igual". */
  warnings: string[];
}

export function useFieldTest<K extends FieldTestCode>(data: FieldData, code: K, categoryId: string, date: string, kind: FieldSessionKind = "tests") {
  const { items, lastSyncAt } = useSync();
  const testType = data.testTypes.find((t) => t.code === code) ?? null;
  const protocol = (data.protocols ?? []).find((p) => p.test_type_id === testType?.id) ?? null;
  const params = useMemo(() => withDefaults(code, protocol?.params), [code, protocol]);
  const metrics = useMemo(
    () => data.metrics.filter((m) => m.test_type_id === testType?.id).sort((a, b) => a.sort_order - b.sort_order),
    [data, testType],
  );
  const category = data.categories.find((c) => c.id === categoryId) ?? null;
  const exclusion = (data.exclusions ?? []).find((e) => e.category_id === categoryId && e.test_type_id === testType?.id) ?? null;
  const roster = useMemo(
    () => data.roster.filter((p) => p.category_id === categoryId).sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name)),
    [data, categoryId],
  );

  const [sessionId, setSessionId] = useState<string | null>(null);
  useEffect(() => {
    let off = false;
    void fieldSessionId(kind, categoryId, date).then((id) => !off && setSessionId(id));
    return () => {
      off = true;
    };
  }, [kind, categoryId, date]);

  const [server, setServer] = useState<{ attempts: TestAttempt[]; voids: TestAttemptVoid[] }>({ attempts: [], voids: [] });
  const load = useCallback(async () => {
    if (!sessionId) return;
    setServer(await loadCachedAttempts(sessionId));
    if (navigator.onLine && data.sessions.some((s) => s.id === sessionId)) {
      try {
        setServer(await refreshAttempts(supabaseBrowser(), sessionId));
      } catch {
        /* sin señal: queda lo del celular */
      }
    }
  }, [sessionId, data.sessions]);
  useEffect(() => {
    void load();
  }, [load, lastSyncAt]);

  // Lo del servidor + lo pendiente en la cola del celular
  const { attempts, voids } = useMemo(() => {
    const a = new Map(server.attempts.map((x) => [x.id, x]));
    const v = new Map(server.voids.map((x) => [x.attempt_id, x]));
    for (const i of items) {
      if (i.table === "test_attempts" && i.row.session_id === sessionId) a.set(i.row.id, i.row as unknown as TestAttempt);
      if (i.table === "test_attempt_voids") {
        const row = i.row as unknown as TestAttemptVoid;
        v.set(row.attempt_id, row);
      }
    }
    return {
      attempts: [...a.values()].filter((x) => x.test_type_id === testType?.id).sort((x, y) => x.attempt - y.attempt || x.recorded_at.localeCompare(y.recorded_at)),
      voids: v,
    };
  }, [server, items, sessionId, testType]);

  const pendingIds = useMemo(() => new Set(items.filter((i) => i.table === "test_attempts").map((i) => i.row.id)), [items]);
  const errorById = useMemo(
    () => new Map(items.filter((i) => (i.table === "test_attempts" || i.table === "test_attempt_voids") && i.status === "error").map((i) => [String(i.row.attempt_id ?? i.row.id), i.error ?? "Error"])),
    [items],
  );

  const metricByCode = useMemo(() => new Map(metrics.map((m) => [m.code, m])), [metrics]);

  /** Valores calculados de un intento (con la misma fórmula que la base). */
  const valuesOf = useCallback(
    (a: Pick<TestAttempt, "method" | "inputs">): (MetricValue & { metric: TestMetric })[] => {
      try {
        return attemptMetrics(code, a.method, a.inputs, params as unknown as Record<string, unknown>)
          .filter((v) => metricByCode.has(v.code))
          .map((v) => ({ ...v, value: round(v.value, metricByCode.get(v.code)!.decimals), metric: metricByCode.get(v.code)! }));
      } catch {
        return [];
      }
    },
    [code, params, metricByCode],
  );

  const check = useCallback(
    (player: RosterPlayer, method: MeasureMethod, inputs: Record<string, unknown>): CheckResult => {
      let raw: MetricValue[];
      try {
        raw = attemptMetrics(code, method, inputs, params as unknown as Record<string, unknown>);
      } catch (e) {
        return { values: [], error: e instanceof AttemptInputError ? e.message : String(e), warnings: [] };
      }
      const values = raw
        .filter((v) => metricByCode.has(v.code))
        .map((v) => ({ ...v, value: round(v.value, metricByCode.get(v.code)!.decimals), metric: metricByCode.get(v.code)! }));
      for (const v of values) {
        const m = v.metric;
        if ((m.min_valid !== null && v.value < m.min_valid) || (m.max_valid !== null && v.value > m.max_valid)) {
          return {
            values,
            error: `${m.name}: ${formatValue(v.value, m.decimals)} ${m.unit} no es posible (${formatValue(m.min_valid, m.decimals)}–${formatValue(m.max_valid, m.decimals)}). Revisá lo que cargaste.`,
            warnings: [],
          };
        }
      }
      const warnings: string[] = [];
      for (const v of values) {
        const r = (data.ranges ?? []).find((x) => x.metric_id === v.metric.id && x.sex === player.sex);
        if (!r) continue;
        if ((r.warn_min !== null && v.value < r.warn_min) || (r.warn_max !== null && v.value > r.warn_max)) {
          warnings.push(
            `${v.metric.name}: ${formatValue(v.value, v.metric.decimals)} ${v.metric.unit} es raro para ${player.sex === "female" ? "jugadoras" : "jugadores"} (lo esperable: ${formatValue(r.warn_min, v.metric.decimals)}–${formatValue(r.warn_max, v.metric.decimals)}).`,
          );
        }
      }
      return { values, error: null, warnings };
    },
    [code, params, metricByCode, data.ranges],
  );

  const save = useCallback(
    async (
      player: RosterPlayer,
      method: MeasureMethod,
      inputs: Record<string, unknown>,
      extra: { notes?: string | null; conditions?: string | null; deviceId?: string | null } = {},
    ): Promise<TestAttempt> => {
      if (!testType || !protocol) throw new Error("Falta el protocolo de este test: actualizá los datos con señal.");
      const session = await ensureFieldSession(data, kind, categoryId, date);
      const attempt: TestAttempt = {
        id: crypto.randomUUID(),
        session_id: session.id,
        player_id: player.id,
        test_type_id: testType.id,
        protocol_id: protocol.id,
        attempt: nextAttemptNumber(attempts, player.id, testType.id),
        method,
        inputs,
        conditions: extra.conditions?.trim() || null,
        device_id: extra.deviceId ?? null,
        notes: extra.notes?.trim() || null,
        recorded_at: new Date().toISOString(),
      };
      await saveAttempt(attempt);
      setServer((s) => ({ ...s, attempts: [...s.attempts, attempt] }));
      return attempt;
    },
    [testType, protocol, data, kind, categoryId, date, attempts],
  );

  const annul = useCallback(
    async (attemptId: string, reason: string) => {
      if (!sessionId) return;
      await voidAttempt(sessionId, attemptId, reason);
      setServer((s) => ({ ...s, voids: [...s.voids, { id: "local", attempt_id: attemptId, reason }] }));
    },
    [sessionId],
  );

  /** Mejor valor vigente de un jugador por métrica (según su sentido). */
  const bestFor = useCallback(
    (playerId: string): Map<string, number> => {
      const best = new Map<string, number>();
      for (const a of attempts) {
        if (a.player_id !== playerId || voids.has(a.id)) continue;
        for (const v of valuesOf(a)) {
          const prev = best.get(v.code);
          const better = prev === undefined || (v.metric.best_of === "avg" ? false : v.metric.higher_is_better ? v.value > prev : v.value < prev);
          if (better) best.set(v.code, v.value);
        }
      }
      return best;
    },
    [attempts, voids, valuesOf],
  );

  return {
    data,
    code,
    date,
    testType,
    protocol,
    params,
    metrics,
    category,
    exclusion,
    roster,
    sessionId,
    attempts,
    voids,
    pendingIds,
    errorById,
    valuesOf,
    check,
    save,
    annul,
    bestFor,
    hasConsent: (playerId: string, type: string) => hasConsent(data.consents, playerId, type),
  };
}

export type FieldTestCtx<K extends FieldTestCode = FieldTestCode> = ReturnType<typeof useFieldTest<K>>;
