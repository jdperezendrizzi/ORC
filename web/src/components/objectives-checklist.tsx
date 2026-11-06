"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { hasConsent, loadCachedObjectives, refreshObjectives, saveLocalObjectiveCheck, type FieldData, type ObjectivesData } from "@/lib/offline/field-data";
import { enqueue } from "@/lib/offline/outbox";
import { objectiveCheckId } from "@/lib/offline/ids";
import { AREA_ORDER, mergeChecks, objectiveAreaLabel, objectiveState, progress } from "@/lib/objectives";
import { formatDate } from "@/lib/labels";
import { clubToday } from "@/lib/validation";
import type { Objective, ObjectiveCheck } from "@/lib/types";
import { useSync } from "./sync-provider";

const d = (iso: string) => formatDate(iso, { day: "numeric", month: "short" });

/** Checklist de objetivos de la categoría en una práctica. Funciona sin señal. */
export function ObjectivesChecklist({ data, categoryId, date, readOnly = false }: { data: FieldData; categoryId: string; date: string; readOnly?: boolean }) {
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
  const playerObjectives = useMemo(
    () => (obj?.objectives ?? []).filter((o) => o.category_id === categoryId && o.scope === "player"),
    [obj, categoryId],
  );

  const canCheck = date <= today && !readOnly;
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

  if (objectives.length === 0 && playerObjectives.length === 0) {
    return (
      <p className="card text-sm">
        {obj ? `Todavía no hay objetivos cargados para ${category?.name ?? "esta categoría"}. Los carga el admin en Admin → Objetivos.` : "Cargando objetivos…"}
      </p>
    );
  }
  return (
    <div className="space-y-4">
      {objectives.length > 0 && (
        <>
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
        </>
      )}
      {playerObjectives.length > 0 && (
        <PlayerObjectives
          data={data}
          categoryId={categoryId}
          date={date}
          objectives={playerObjectives}
          checks={checks}
          canCheck={canCheck}
          pendingKeys={new Set(pendingRows.map((r) => r.item.key))}
          errors={new Map(pendingRows.filter((r) => r.item.status === "error").map((r) => [r.row.id, r.item.error ?? ""]))}
        />
      )}
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

/** Objetivos por jugador (desde la categoría que configura el admin): se marca a cada jugador. */
function PlayerObjectives({
  data,
  categoryId,
  date,
  objectives,
  checks,
  canCheck,
  pendingKeys,
  errors,
}: {
  data: FieldData;
  categoryId: string;
  date: string;
  objectives: Objective[];
  checks: ObjectiveCheck[];
  canCheck: boolean;
  pendingKeys: Set<string>;
  errors: Map<string, string>;
}) {
  const [selectedId, setSelectedId] = useState(objectives[0]?.id ?? "");
  const [ids, setIds] = useState<Map<string, string>>(new Map());
  const o = objectives.find((x) => x.id === selectedId) ?? objectives[0];
  const players = useMemo(
    () => data.roster.filter((p) => p.category_id === categoryId).sort((a, b) => a.last_name.localeCompare(b.last_name)),
    [data, categoryId],
  );
  const consent = useMemo(
    () => new Set(data.roster.filter((p) => hasConsent(data.consents, p.id, "performance_data")).map((p) => p.id)),
    [data],
  );

  // ids determinísticos de las marcas de hoy (para saber cuáles están sin subir)
  useEffect(() => {
    let cancelled = false;
    void Promise.all(players.map(async (p) => [p.id, await objectiveCheckId(o.id, date, p.id)] as const)).then((pairs) => {
      if (!cancelled) setIds(new Map(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [players, o.id, date]);

  async function mark(playerIds: string[], achieved: boolean) {
    if (!canCheck) return;
    for (const pid of playerIds) {
      if (!consent.has(pid)) continue;
      const id = await objectiveCheckId(o.id, date, pid);
      const row: ObjectiveCheck = { id, objective_id: o.id, season_id: data.season.id, check_date: date, player_id: pid, achieved, note: null };
      await saveLocalObjectiveCheck(row);
      await enqueue("objective_checks", { ...row });
    }
  }

  const states = new Map(players.map((p) => [p.id, objectiveState(checks, o.id, date, p.id)]));
  const done = players.filter((p) => states.get(p.id)?.achieved).length;
  const unmarkedToday = players.filter((p) => consent.has(p.id) && !states.get(p.id)?.today).map((p) => p.id);
  const countFor = (x: Objective) => players.filter((p) => objectiveState(checks, x.id, date, p.id).achieved).length;

  return (
    <section className="space-y-3" aria-label="Objetivos por jugador">
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wide text-orc-muted">Objetivos por jugador</h2>
        <p className="text-sm text-orc-muted">Elegí un objetivo y marcá a cada jugador. Si no lo viste hoy, dejalo sin marcar.</p>
      </div>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Objetivo">
        {objectives.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={x.id === o.id}
            onClick={() => setSelectedId(x.id)}
            className={`shrink-0 rounded-xl border px-3 py-2 text-left text-sm ${x.id === o.id ? "border-orc-orange bg-orc-orange-soft font-bold" : "border-orc-line-strong bg-orc-surface"}`}
          >
            <span className="block max-w-[14rem] truncate">{x.title}</span>
            <span className="text-xs text-orc-muted">
              {countFor(x)} de {players.length}
            </span>
          </button>
        ))}
      </div>

      <div className="card space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-bold">{o.title}</h3>
          <span className="text-sm">
            <b className="text-lg tabular-nums">{done}</b> de {players.length} lo lograron
          </span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-orc-chip" role="progressbar" aria-valuemin={0} aria-valuemax={players.length} aria-valuenow={done}>
          <div className="h-full rounded-full bg-orc-orange transition-all" style={{ width: `${players.length ? (done / players.length) * 100 : 0}%` }} />
        </div>
        {(o.look_for || o.exercise_name || o.exercise_description) && (
          <details className="text-sm">
            <summary className="cursor-pointer font-semibold text-orc-orange-strong">Qué mirar y ejercicio</summary>
            {o.look_for && (
              <p className="mt-2">
                <b>Qué mirar:</b> {o.look_for}
              </p>
            )}
            {(o.exercise_name || o.exercise_description) && (
              <div className="mt-2 rounded-lg bg-orc-chip px-3 py-2">
                <p className="font-semibold">Ejercicio{o.exercise_name ? `: ${o.exercise_name}` : ""}</p>
                {o.exercise_description && <p className="whitespace-pre-line">{o.exercise_description}</p>}
                {o.exercise_url && (
                  <a href={o.exercise_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block font-semibold text-orc-orange-strong">
                    Ver video / material →
                  </a>
                )}
              </div>
            )}
          </details>
        )}
        <button type="button" className="btn-dark h-10" disabled={!canCheck || unmarkedToday.length === 0} onClick={() => void mark(unmarkedToday, true)}>
          {unmarkedToday.length ? `Todos logrados (${unmarkedToday.length} sin marcar hoy)` : "Todos marcados hoy"}
        </button>
      </div>

      <ul className="card divide-y divide-orc-line p-0">
        {players.map((p) => {
          const st = states.get(p.id)!;
          const today = st.today;
          const ok = consent.has(p.id);
          const id = ids.get(p.id);
          const err = id ? errors.get(id) : undefined;
          const pending = id ? pendingKeys.has(`objective_checks:${id}`) : false;
          const name = `${p.last_name}, ${p.first_name}`;
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{name}</span>
                <span className="block text-xs text-orc-muted">
                  {!ok ? "Sin consentimiento de rendimiento" : statusText(st)}
                  {err ? <span className="chip tone-red ml-2">No se pudo subir: {err}</span> : pending ? <span className="chip tone-amber ml-2">Sin subir</span> : null}
                </span>
              </span>
              <span className="flex gap-1" role="radiogroup" aria-label={`${o.title}: ${name}`}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={today?.achieved === true}
                  aria-label={`Logrado: ${name}`}
                  disabled={!canCheck || !ok}
                  onClick={() => void mark([p.id], true)}
                  className={`h-10 rounded-lg border px-3 text-sm font-semibold ${today?.achieved === true ? "border-green-600 bg-green-600 text-white" : "border-orc-line-strong bg-orc-field"}`}
                >
                  ✓ Logrado
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={today?.achieved === false}
                  aria-label={`No logrado: ${name}`}
                  disabled={!canCheck || !ok}
                  onClick={() => void mark([p.id], false)}
                  className={`h-10 rounded-lg border px-3 text-sm font-semibold ${today?.achieved === false ? "border-red-600 bg-red-600 text-white" : "border-orc-line-strong bg-orc-field"}`}
                >
                  ✗ No
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
