"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { loadCachedFieldData } from "@/lib/offline/field-data";
import { discardOutbox } from "@/lib/offline/outbox";
import { bodyRegionLabel, formatDate, injuryTypeLabel } from "@/lib/labels";
import { useSync } from "./sync-provider";

/**
 * Lesiones registradas en este celular que todavía no se subieron
 * (sin señal) o que la base rechazó. Cuando se suben, refresca la página
 * para que aparezcan en la lista del servidor.
 */
export function PendingInjuries({ excludeKey }: { excludeKey?: string }) {
  const { items, online, syncing, syncNow } = useSync();
  const router = useRouter();
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const pending = useMemo(
    () => items.filter((i) => i.table === "injuries" && i.key !== excludeKey),
    [items, excludeKey],
  );

  useEffect(() => {
    void loadCachedFieldData().then((c) => {
      if (c) setNames(new Map(c.data.roster.map((p) => [p.id, `${p.last_name}, ${p.first_name}`])));
    });
  }, []);

  // Si bajó la cantidad (se subieron), traer la lista actualizada del servidor.
  const prev = useRef(pending.length);
  useEffect(() => {
    if (pending.length < prev.current && navigator.onLine) router.refresh();
    prev.current = pending.length;
  }, [pending.length, router]);

  if (pending.length === 0) return null;
  return (
    <section className="card space-y-2" aria-label="Lesiones sin subir">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">En este celular, sin subir ({pending.length})</h2>
        {online ? (
          <button type="button" className="btn-ghost h-9 text-sm" disabled={syncing} onClick={() => void syncNow()}>
            {syncing ? "Subiendo…" : "Reintentar"}
          </button>
        ) : (
          <span className="chip tone-amber text-xs">Sin señal: se suben solas cuando vuelva</span>
        )}
      </div>
      <ul className="divide-y divide-orc-line rounded-lg border border-orc-line">
        {pending.map((i) => {
          const r = i.row as Record<string, string>;
          return (
            <li key={i.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{names.get(r.player_id) ?? "Jugador"}</span>
                <span className="text-orc-muted">
                  {injuryTypeLabel[r.injury_type]} · {bodyRegionLabel[r.body_region]} ·{" "}
                  {formatDate(r.occurred_on, { day: "numeric", month: "short" })}
                </span>
                {i.status === "error" && <span className="mt-1 block rounded tone-red px-2 py-1">{i.error}</span>}
              </span>
              {i.status === "error" ? (
                <button
                  type="button"
                  className="text-sm font-semibold text-orc-orange-strong underline"
                  onClick={() => {
                    if (confirm("¿Descartar esta lesión? No se va a subir.")) void discardOutbox(i.key);
                  }}
                >
                  Descartar
                </button>
              ) : (
                <span className="chip tone-amber text-xs">Pendiente</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
