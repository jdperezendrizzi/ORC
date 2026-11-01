"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  hasConsent,
  loadCachedSessionResults,
  refreshSessionResults,
  saveCachedSessionResults,
  type FieldData,
} from "@/lib/offline/field-data";
import { enqueue, discardOutbox } from "@/lib/offline/outbox";
import { resultId } from "@/lib/offline/ids";
import { formatInput, formatValue, parseMetricValue } from "@/lib/validation";
import type { EvaluationSession, ResultRow, TestMetric, TestType } from "@/lib/types";
import { useSync } from "../sync-provider";

// Intentos por defecto según protocolo.
const DEFAULT_ATTEMPTS: Record<string, number> = {
  sprint_40: 2,
  cmj: 3,
  agility_505: 2,
  t_test: 2,
  grip_strength: 2,
  reaction: 3,
};

const cellKey = (playerId: string, metricId: string, attempt: number) => `${playerId}:${metricId}:${attempt}`;

interface Props {
  data: FieldData;
  session: EvaluationSession;
  testType: TestType;
}

export function EntryGrid({ data, session, testType }: Props) {
  const { items, online } = useSync();
  const metrics = useMemo(
    () => data.metrics.filter((m) => m.test_type_id === testType.id && !m.derivation),
    [data.metrics, testType.id],
  );
  const players = useMemo(
    () => data.roster.filter((p) => p.category_id === session.category_id),
    [data.roster, session.category_id],
  );
  const positions = useMemo(() => new Map(data.positions.map((p) => [p.id, p])), [data.positions]);

  const [attempts, setAttempts] = useState(DEFAULT_ATTEMPTS[testType.code] ?? 1);
  const [serverRows, setServerRows] = useState<ResultRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("");

  // Resultados ya cargados (cache local → servidor).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await loadCachedSessionResults(session.id);
      if (!cancelled) setServerRows(cached);
      if (navigator.onLine) {
        try {
          const fresh = await refreshSessionResults(supabaseBrowser(), session.id);
          if (!cancelled) setServerRows(fresh);
        } catch {
          /* sin señal o sesión todavía no subida: seguimos con el cache */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session.id]);

  // id existente por celda (si el dato vino del servidor, se reutiliza su id).
  const serverByCell = useMemo(() => {
    const map = new Map<string, ResultRow>();
    for (const r of serverRows) map.set(cellKey(r.player_id, r.metric_id, r.attempt), r);
    return map;
  }, [serverRows]);

  // Cambios locales de esta sesión (pendientes o con error).
  const outboxByCell = useMemo(() => {
    const map = new Map<string, (typeof items)[number]>();
    for (const i of items) {
      if (i.table !== "results" || i.row.session_id !== session.id) continue;
      map.set(cellKey(String(i.row.player_id), String(i.row.metric_id), Number(i.row.attempt)), i);
    }
    return map;
  }, [items, session.id]);

  // Cuando un cambio local se sube (sale de la outbox), se pasa a serverRows
  // para que la celda no quede vacía hasta el próximo refresh.
  const prevOutbox = useRef(outboxByCell);
  useEffect(() => {
    const prev = prevOutbox.current;
    prevOutbox.current = outboxByCell;
    const synced = [...prev.entries()].filter(([k, item]) => !outboxByCell.has(k) && item.status === "pending");
    if (synced.length === 0) return;
    setServerRows((rows) => {
      const byId = new Map(rows.map((r) => [r.id, r]));
      for (const [, item] of synced) {
        const row = item.row as unknown as ResultRow;
        if (item.row.deleted_at) byId.delete(row.id);
        else byId.set(row.id, row);
      }
      const next = [...byId.values()];
      // Persistir: si después se recarga sin señal, los valores siguen ahí.
      void saveCachedSessionResults(session.id, next);
      return next;
    });
  }, [outboxByCell, session.id]);

  const valueFor = useCallback(
    (key: string, decimals: number): string => {
      if (key in drafts) return drafts[key];
      const local = outboxByCell.get(key);
      if (local) return local.row.deleted_at ? "" : formatInput(Number(local.row.value), decimals);
      const server = serverByCell.get(key);
      return server ? formatInput(Number(server.value), decimals) : "";
    },
    [drafts, outboxByCell, serverByCell],
  );

  async function commit(playerId: string, metric: TestMetric, attempt: number, raw: string) {
    const key = cellKey(playerId, metric.id, attempt);
    const server = serverByCell.get(key);
    const local = outboxByCell.get(key);
    const id = server?.id ?? (local?.row.id as string | undefined) ?? (await resultId(session.id, playerId, metric.id, attempt));
    const parsed = parseMetricValue(raw, metric);

    if (!parsed.ok && parsed.empty) {
      // Celda vaciada: baja lógica si el dato existía.
      const prevValue = local?.row.value ?? server?.value;
      if (prevValue !== undefined && !(local?.row.deleted_at)) {
        await enqueue("results", {
          id,
          session_id: session.id,
          player_id: playerId,
          metric_id: metric.id,
          attempt,
          value: Number(prevValue),
          recorded_at: new Date().toISOString(),
          deleted_at: new Date().toISOString(),
        });
      }
    } else if (parsed.ok) {
      const prev = local && !local.row.deleted_at ? Number(local.row.value) : server ? Number(server.value) : undefined;
      if (prev !== parsed.value || local?.status === "error") {
        await enqueue("results", {
          id,
          session_id: session.id,
          player_id: playerId,
          metric_id: metric.id,
          attempt,
          value: parsed.value,
          recorded_at: new Date().toISOString(),
          deleted_at: null,
        });
      }
    } else {
      return; // inválido: queda el borrador en rojo, no se encola
    }
    setDrafts((d) => {
      const { [key]: _drop, ...rest } = d;
      return rest;
    });
  }

  // Enter = siguiente casillero (orden de lectura).
  const gridRef = useRef<HTMLDivElement>(null);
  function focusNext(current: HTMLInputElement) {
    const inputs = Array.from(gridRef.current?.querySelectorAll<HTMLInputElement>("input[data-cell]:not(:disabled)") ?? []);
    const idx = inputs.indexOf(current);
    inputs[idx + 1]?.focus();
    inputs[idx + 1]?.select();
  }

  const visiblePlayers = players.filter((p) =>
    `${p.first_name} ${p.last_name} ${p.jersey_number ?? ""}`.toLowerCase().includes(filter.trim().toLowerCase()),
  );
  const loadedCount = players.filter((p) =>
    metrics.some((m) => valueFor(cellKey(p.id, m.id, 1), m.decimals) !== ""),
  ).length;

  return (
    <div className="space-y-3">
      <div className="card space-y-3 p-3">
        {testType.protocol && <p className="text-sm text-orc-muted">{testType.protocol}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            Intentos
            <select
              value={attempts}
              onChange={(e) => setAttempts(Number(e.target.value))}
              className="h-9 rounded-md border border-orc-line-strong bg-orc-field px-2 text-orc-ink"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <input
            type="search"
            placeholder="Buscar jugador o número"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-9 min-w-0 flex-1 rounded-md border border-orc-line-strong bg-orc-field px-3 text-sm text-orc-ink placeholder:text-orc-muted"
          />
          <span className="text-sm tabular-nums text-orc-muted">
            {loadedCount}/{players.length} cargados
          </span>
        </div>
        {!online && (
          <p className="rounded-md bg-orc-black px-3 py-2 text-xs text-white">
            Sin señal: todo se guarda en el celular y se sube solo cuando vuelva la conexión.
          </p>
        )}
      </div>

      <div ref={gridRef} className="space-y-2">
        {visiblePlayers.map((p) => {
          const pos = p.position_id ? positions.get(p.position_id) : undefined;
          return (
            <article key={p.id} className="card p-3">
              <header className="mb-2 flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-full bg-orc-black text-sm font-bold text-orc-orange">
                  {p.jersey_number ?? p.position_id ?? "–"}
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {p.last_name}, {p.first_name}
                </span>
                <span className="text-xs text-orc-muted">{pos?.short_name}</span>
              </header>

              <div className="space-y-2">
                {metrics.map((m) => {
                  const consentOk = hasConsent(data.consents, p.id, m.required_consent);
                  return (
                    <div key={m.id}>
                      <div className="mb-1 flex items-baseline justify-between text-xs">
                        <span className="font-medium text-orc-muted">
                          {m.name} <span className="font-normal">({m.unit})</span>
                        </span>
                        {!consentOk && <span className="font-semibold text-warn">Sin consentimiento</span>}
                      </div>
                      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${attempts}, minmax(0, 1fr))` }}>
                        {Array.from({ length: attempts }, (_, a) => a + 1).map((attempt) => {
                          const key = cellKey(p.id, m.id, attempt);
                          const value = valueFor(key, m.decimals);
                          const parsed = key in drafts ? parseMetricValue(drafts[key], m) : null;
                          const invalid = parsed && !parsed.ok && !parsed.empty ? parsed.error : null;
                          const out = outboxByCell.get(key);
                          const status = out?.status === "error" ? "error" : out ? "pending" : serverByCell.has(key) ? "synced" : null;
                          return (
                            <div key={attempt} className="relative">
                              <input
                                data-cell
                                aria-label={`${p.last_name} ${m.name} intento ${attempt}`}
                                inputMode={m.decimals === 0 ? "numeric" : "decimal"}
                                enterKeyHint="next"
                                autoComplete="off"
                                disabled={!consentOk}
                                placeholder={attempts > 1 ? `#${attempt}` : "—"}
                                value={value}
                                onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                                onBlur={(e) => void commit(p.id, m, attempt, e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    focusNext(e.currentTarget);
                                  }
                                }}
                                className={`field-input pr-7 ${
                                  invalid || status === "error" ? "border-bad bg-bad/10" : ""
                                } disabled:cursor-not-allowed disabled:border-orc-line disabled:bg-orc-chip`}
                              />
                              <StatusDot status={status} />
                              {invalid && <p className="mt-0.5 text-xs text-bad">{invalid}</p>}
                              {status === "error" && out && (
                                <p className="mt-0.5 text-xs text-bad">
                                  {out.error}{" "}
                                  <button type="button" className="underline" onClick={() => void discardOutbox(out.key)}>
                                    Descartar
                                  </button>
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                <DerivedPreview testCode={testType.code} metrics={metrics} playerId={p.id} attempts={attempts} valueFor={valueFor} />
              </div>
            </article>
          );
        })}
        {visiblePlayers.length === 0 && <p className="py-6 text-center text-sm text-orc-muted">No hay jugadores.</p>}
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: "pending" | "error" | "synced" | null }) {
  if (!status) return null;
  const map = {
    pending: { cls: "bg-orc-orange", title: "Guardado en el celular, falta subir" },
    error: { cls: "bg-bad", title: "Error al subir" },
    synced: { cls: "bg-good", title: "Subido" },
  } as const;
  return (
    <span
      className={`pointer-events-none absolute top-1/2 right-2.5 size-2.5 -translate-y-1/2 rounded-full ${map[status].cls}`}
      title={map[status].title}
      aria-label={map[status].title}
    />
  );
}

/** Vista previa del 1RM estimado (la base lo calcula al sincronizar). */
function DerivedPreview({
  testCode,
  metrics,
  playerId,
  attempts,
  valueFor,
}: {
  testCode: string;
  metrics: TestMetric[];
  playerId: string;
  attempts: number;
  valueFor: (key: string, decimals: number) => string;
}) {
  if (!["back_squat", "bench_press", "deadlift"].includes(testCode)) return null;
  const load = metrics.find((m) => m.code.endsWith("_load_kg"));
  const reps = metrics.find((m) => m.code.endsWith("_reps"));
  if (!load || !reps) return null;
  let best: number | null = null;
  for (let a = 1; a <= attempts; a++) {
    const l = Number(valueFor(cellKey(playerId, load.id, a), 1).replace(",", "."));
    // (valueFor devuelve formato de input: sin separador de miles)
    const r = Number(valueFor(cellKey(playerId, reps.id, a), 0).replace(",", "."));
    if (l > 0 && r >= 1 && r <= 12) {
      const e1rm = r === 1 ? l : l * (1 + r / 30);
      best = Math.max(best ?? 0, e1rm);
    }
  }
  if (best === null) return null;
  return <p className="text-xs text-orc-muted">1RM estimado ≈ {formatValue(best, 1)} kg (Epley)</p>;
}
