"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { loadCachedObjectives, refreshObjectives, saveLocalObjectiveCheck, type FieldData, type ObjectivesData } from "@/lib/offline/field-data";
import { enqueue } from "@/lib/offline/outbox";
import { objectiveCheckId } from "@/lib/offline/ids";
import { AREA_ORDER, mergeChecks, objectiveAreaLabel, objectiveState, progress } from "@/lib/objectives";
import { formatDate } from "@/lib/labels";
import { clubToday } from "@/lib/validation";
import type { Objective, ObjectiveCheck } from "@/lib/types";
import { useSync } from "./sync-provider";

const d = (iso: string) => formatDate(iso, { day: "numeric", month: "short" });

/** Checklist de objetivos de la categoría en una práctica. Funciona sin señal. */
export function ObjectivesChecklist({ data, categoryId, date }: { data: FieldData; categoryId: string; date: string }) {
  const { items, lastSyncAt } = useSync();
  const [obj, setObj] = useState<ObjectivesData | null>(null);
  const today = clubToday();

  const categoryIds = useMemo(() => data.categories.map((c) => c.id).join(","), [data]);

  const refresh = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      setObj(await refreshObjectives(supabaseBrowser(), data.season.id, categoryIds.split(",").filter(Boolean)));
    } catch {
      /* sin señal: queda lo guardado */
    }
  }, [data.season.id, categoryIds]);

  useEffect(() => {
    void loadCachedObjectives().then((c) => c && setObj((prev) => prev ?? c));
  }, []);
  // Al abrir y después de cada sincronización, traer lo último (lo que tachó otro profe).
  useEffect(() => {
    void refresh();
  }, [refresh, lastSyncAt]);

  const pendingRows = useMemo(
    () => items.filter((i) => i.table === "objective_checks").map((i) => ({ row: i.row as unknown as ObjectiveCheck, item: i })),
    [items],
  );
  const checks = useMemo(() => mergeChecks(obj?.checks ?? [], pendingRows.map((p) => p.row)), [obj, pendingRows]);
  const objectives = useMemo(
    () => (obj?.objectives ?? []).filter((o) => o.category_id === categoryId && o.scope === "team"),
    [obj, categoryId],
  );

  const canCheck = date <= today;
  async function mark(o: Objective, achieved: boolean, note?: string | null) {
    if (!canCheck) return;
    const id = await objectiveCheckId(o.id, date, null);
    const prevNote = checks.find((c) => c.id === id)?.note ?? null;
    const row: ObjectiveCheck = {
      id,
      objective_id: o.id,
      season_id: data.season.id,
      check_date: date,
      player_id: null,
      achieved,
      note: note === undefined ? prevNote : note,
    };
    await saveLocalObjectiveCheck(row);
    await enqueue("objective_checks", { ...row });
  }

  const p = progress(objectives, checks, date);
  const category = data.categories.find((c) => c.id === categoryId);

  if (objectives.length === 0) {
    return (
      <p className="card text-sm">
        {obj ? `Todavía no hay objetivos cargados para ${category?.name ?? "esta categoría"}. Los carga el admin en Admin → Objetivos.` : "Cargando objetivos…"}
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-orc-muted">Después de la práctica, tachá lo que el equipo cumplió. Tocá un objetivo para ver qué mirar y el ejercicio.</p>
      <section className="card space-y-2" aria-label="Avance">
        <div className="flex items-baseline justify-between">
          <span className="font-bold">{category?.name}</span>
          <span className="text-sm">
            <b className="text-lg tabular-nums">{p.done}</b> de {p.total} logrados
          </span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-orc-chip" role="progressbar" aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={p.done}>
          <div className="h-full rounded-full bg-orc-orange transition-all" style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%` }} />
        </div>
      </section>

      {AREA_ORDER.map((area) => {
        const list = objectives.filter((o) => o.area === area);
        if (list.length === 0) return null;
        return (
          <section key={area} className="space-y-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-orc-muted">{objectiveAreaLabel[area]}</h2>
            <ul className="space-y-2">
              {list.map((o) => {
                const st = objectiveState(checks, o.id, date);
                const pend = pendingRows.find((r) => r.row.objective_id === o.id && r.row.check_date === date)?.item;
                return (
                  <ObjectiveItem
                    key={o.id}
                    objective={o}
                    achieved={st.achieved}
                    status={statusText(st)}
                    note={st.today?.note ?? ""}
                    sync={pend ? (pend.status === "error" ? `No se pudo subir: ${pend.error}` : "Sin subir") : null}
                    disabled={!canCheck}
                    onToggle={() => void mark(o, !st.achieved)}
                    onNote={(note) => void mark(o, st.achieved, note || null)}
                  />
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function statusText(st: ReturnType<typeof objectiveState>): string {
  if (st.achieved) {
    return st.firstAchieved && st.lastDate && st.firstAchieved !== st.lastDate
      ? `Logrado desde el ${d(st.firstAchieved)} · última vez ${d(st.lastDate)}`
      : `Logrado el ${d(st.lastDate!)}`;
  }
  if (st.lastDate) return `No se vio el ${d(st.lastDate)}${st.firstAchieved ? ` (logrado antes, el ${d(st.firstAchieved)})` : ""}`;
  return "Pendiente";
}

function ObjectiveItem({
  objective: o,
  achieved,
  status,
  note,
  sync,
  disabled,
  onToggle,
  onNote,
}: {
  objective: Objective;
  achieved: boolean;
  status: string;
  note: string;
  sync: string | null;
  disabled: boolean;
  onToggle: () => void;
  onNote: (note: string) => void;
}) {
  const [draft, setDraft] = useState(note);
  useEffect(() => setDraft(note), [note]);
  return (
    <li className={`card flex gap-3 p-3 ${achieved ? "border-orc-orange" : ""}`}>
      <button
        type="button"
        role="checkbox"
        aria-checked={achieved}
        aria-label={`${achieved ? "Destachar" : "Tachar"}: ${o.title}`}
        disabled={disabled}
        onClick={onToggle}
        className={`grid size-11 shrink-0 place-items-center rounded-lg border-2 text-2xl font-black ${
          achieved ? "border-orc-orange bg-orc-orange text-orc-black" : "border-orc-line-strong bg-orc-field"
        }`}
      >
        {achieved ? "✓" : ""}
      </button>
      <details className="min-w-0 flex-1">
        <summary className="cursor-pointer list-none">
          <span className={`block font-semibold ${achieved ? "line-through decoration-2 decoration-orc-orange" : ""}`}>{o.title}</span>
          <span className="block text-xs text-orc-muted">
            {status}
            {sync && <span className="chip tone-amber ml-2">{sync}</span>}
          </span>
        </summary>
        <div className="mt-3 space-y-2 text-sm">
          {o.look_for && (
            <p>
              <b>Qué mirar:</b> {o.look_for}
            </p>
          )}
          {(o.exercise_name || o.exercise_description) && (
            <div className="rounded-lg bg-orc-chip px-3 py-2">
              <p className="font-semibold">Ejercicio{o.exercise_name ? `: ${o.exercise_name}` : ""}</p>
              {o.exercise_description && <p className="whitespace-pre-line">{o.exercise_description}</p>}
              {o.exercise_url && (
                <a href={o.exercise_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block font-semibold text-orc-orange-strong">
                  Ver video / material →
                </a>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <input
              className="field-input h-10 flex-1 text-sm"
              placeholder="Nota de esta práctica (opcional)"
              maxLength={300}
              value={draft}
              disabled={disabled}
              onChange={(e) => setDraft(e.target.value)}
              aria-label={`Nota: ${o.title}`}
            />
            <button type="button" className="btn-ghost h-10" disabled={disabled || draft === note} onClick={() => onNote(draft.trim())}>
              Guardar
            </button>
          </div>
        </div>
      </details>
    </li>
  );
}
