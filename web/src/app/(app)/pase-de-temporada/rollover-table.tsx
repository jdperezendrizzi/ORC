"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { Message, type ActionResult } from "@/components/action-form";
import { proposalReasonLabel, type ProposalReason } from "@/lib/rollover";
import { applyRollover } from "./actions";

export interface RolloverRow {
  playerId: string;
  name: string;
  ageNext: number;
  proposedId: string | null;
  reason: ProposalReason;
  recommendation: string | null;
  alreadyIn: string | null; // categoría ya asignada en la temporada destino
}

const reasonTone: Record<ProposalReason, string> = {
  decision_promote: "tone-green",
  decision_stay: "tone-amber",
  observe: "tone-amber",
  age: "",
};

export function RolloverTable({
  rows,
  categories,
  toSeason,
  canApply,
}: {
  rows: RolloverRow[];
  categories: { id: string; name: string }[];
  toSeason: { id: string; name: string };
  canApply: boolean;
}) {
  const [state, formAction] = useActionState(applyRollover, {} as ActionResult);
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.playerId, r.proposedId ?? ""])),
  );
  const [include, setInclude] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(rows.map((r) => [r.playerId, !r.alreadyIn && !!r.proposedId])),
  );
  const catName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  const selected = rows.filter((r) => include[r.playerId] && target[r.playerId] && !r.alreadyIn);
  const moves = selected.map((r) => ({ player_id: r.playerId, category_id: target[r.playerId] }));
  const byCat = new Map<string, number>();
  for (const m of moves) byCat.set(m.category_id, (byCat.get(m.category_id) ?? 0) + 1);

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        // Envío manual: con <form action> React resetea el formulario y los
        // tildes (controlados) quedarían desfasados de lo que se aplicó.
        e.preventDefault();
        if (!window.confirm(`¿Pasar ${moves.length} jugadores a la temporada ${toSeason.name}? Los que ya tengan categoría en ${toSeason.name} no se tocan.`)) return;
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      <input type="hidden" name="to_season" value={toSeason.id} />
      <input type="hidden" name="to_season_name" value={toSeason.name} />
      <input type="hidden" name="moves" value={JSON.stringify(moves)} />

      <section className="card overflow-x-auto p-0">
        <table className="w-full min-w-[600px] text-sm">
          <thead className="bg-orc-black text-left text-xs uppercase tracking-wide text-white">
            <tr>
              <th className="w-10 px-3 py-2">
                <span className="sr-only">Incluir</span>
              </th>
              <th className="px-3 py-2">Jugador</th>
              <th className="px-3 py-2 text-right">Edad {toSeason.name}</th>
              <th className="px-3 py-2">Por qué</th>
              <th className="px-3 py-2">Pasa a</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-orc-line">
            {rows.map((r) => (
              <tr key={r.playerId} className={r.alreadyIn ? "opacity-60" : ""}>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label={`Incluir a ${r.name}`}
                    checked={!!include[r.playerId] && !r.alreadyIn}
                    disabled={!!r.alreadyIn || !canApply}
                    onChange={(e) => setInclude((s) => ({ ...s, [r.playerId]: e.target.checked }))}
                    className="size-5 accent-orc-orange"
                  />
                </td>
                <td className="px-3 py-2 font-semibold">{r.name}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.ageNext}</td>
                <td className="px-3 py-2">
                  <span className={`chip text-xs ${reasonTone[r.reason]}`}>{proposalReasonLabel[r.reason]}</span>
                  {r.recommendation && <span className="ml-1 text-xs text-orc-muted">(profe: {r.recommendation})</span>}
                </td>
                <td className="px-3 py-2">
                  {r.alreadyIn ? (
                    <span className="text-xs">Ya está en {r.alreadyIn}</span>
                  ) : (
                    <select
                      aria-label={`Categoría ${toSeason.name} de ${r.name}`}
                      value={target[r.playerId] ?? ""}
                      disabled={!canApply}
                      onChange={(e) => setTarget((s) => ({ ...s, [r.playerId]: e.target.value }))}
                      className="field-input h-9 py-0 text-sm"
                    >
                      <option value="">Sin asignar</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {canApply ? (
        <div className="card flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 text-sm">
            {moves.length === 0 ? (
              "No hay jugadores seleccionados."
            ) : (
              <>
                Pasan <b>{moves.length}</b> a {toSeason.name}:{" "}
                {[...byCat.entries()].map(([id, n]) => `${catName.get(id)} (${n})`).join(" · ")}
              </>
            )}
          </p>
          <button type="submit" className="btn-primary" disabled={moves.length === 0 || pending}>
            {pending ? "Pasando…" : "Pasar jugadores"}
          </button>
          <Message state={state} />
        </div>
      ) : (
        <p className="card text-sm text-orc-muted">Podés ver la propuesta, pero no tenés habilitado aplicar pases.</p>
      )}
    </form>
  );
}
