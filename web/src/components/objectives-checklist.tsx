"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { hasConsent, loadCachedObjectives, refreshObjectives, saveLocalObjectiveCheck, type FieldData, type ObjectivesData } from "@/lib/offline/field-data";
import { enqueue } from "@/lib/offline/outbox";
import { objectiveCheckId } from "@/lib/offline/ids";
import {
  AREA_ORDER,
  mergeChecks,
  objectiveAreaLabel,
  objectiveState,
  objectiveStatusIcon,
  objectiveStatusLabel,
  progress,
  STATUS_ORDER,
  statusOf,
  type ObjectiveStatus,
} from "@/lib/objectives";
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
  async function mark(o: Objective, status: ObjectiveStatus, note?: string | null) {
    if (!canCheck) return;
    const id = await objectiveCheckId(o.id, date, null);
    const prevNote = checks.find((c) => c.id === id)?.note ?? null;
    const row: ObjectiveCheck = {
      id,
      objective_id: o.id,
      season_id: data.season.id,
      check_date: date,
      player_id: null,
      status,
      achieved: status === "achieved",
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
      <p className="text-sm text-orc-muted">
        Después de la práctica, marcá cada objetivo: <b>✕ Todavía no</b>, <b>◐ En progreso</b> o <b>✓ Logrado</b>. Tocá el título para ver qué mirar, el
        ejercicio y su recorrido.
      </p>
      <section className="card space-y-2" aria-label="Avance">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-bold">{category?.name}</span>
          <span className="text-sm">
            <b className="text-lg tabular-nums">{p.done}</b> logrados · <b className="tabular-nums">{p.inProgress}</b> en progreso · de {p.total}
          </span>
        </div>
        <ProgressBar done={p.done} inProgress={p.inProgress} total={p.total} />
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
                    current={st.status}
                    todayStatus={st.today ? statusOf(st.today) : null}
                    summary={statusText(st)}
                    history={st.history}
                    note={st.today?.note ?? ""}
                    sync={pend ? (pend.status === "error" ? `No se pudo subir: ${pend.error}` : "Sin subir") : null}
                    disabled={!canCheck}
                    onMark={(status) => void mark(o, status)}
                    onNote={(note) => void mark(o, st.today ? statusOf(st.today) : (st.status ?? "not_yet"), note || null)}
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
  if (!st.status || !st.lastDate) return "Sin marcar todavía";
  const base = `${objectiveStatusIcon[st.status]} ${objectiveStatusLabel[st.status]} (${d(st.lastDate)})`;
  if (st.status !== "achieved" && st.firstAchieved) return `${base} · logrado antes, el ${d(st.firstAchieved)}`;
  if (st.status === "achieved" && st.firstAchieved && st.firstAchieved !== st.lastDate) return `${base} · logrado desde el ${d(st.firstAchieved)}`;
  return base;
}

const STATUS_STYLE: Record<ObjectiveStatus, string> = {
  not_yet: "border-zinc-500 bg-zinc-600 text-white",
  in_progress: "border-amber-500 bg-amber-400 text-orc-black",
  achieved: "border-orc-orange bg-orc-orange text-orc-black",
};

/** Barra de avance: logrados (naranja) y en progreso (ámbar). */
export function ProgressBar({ done, inProgress, total }: { done: number; inProgress: number; total: number }) {
  const pct = (n: number) => `${total ? (n / total) * 100 : 0}%`;
  return (
    <div
      className="flex h-2.5 overflow-hidden rounded-full bg-orc-chip"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-valuetext={`${done} logrados y ${inProgress} en progreso de ${total}`}
    >
      <div className="h-full bg-orc-orange transition-all" style={{ width: pct(done) }} />
      <div className="h-full bg-amber-400 transition-all" style={{ width: pct(inProgress) }} />
    </div>
  );
}

/** Tres botones: «Todavía no», «En progreso», «Logrado». */
function StatusPicker({ value, onPick, disabled, label }: { value: ObjectiveStatus | null; onPick: (s: ObjectiveStatus) => void; disabled: boolean; label: string }) {
  return (
    <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label={label}>
      {STATUS_ORDER.map((st) => (
        <button
          key={st}
          type="button"
          role="radio"
          aria-checked={value === st}
          aria-label={`${objectiveStatusLabel[st]}: ${label}`}
          disabled={disabled}
          onClick={() => onPick(st)}
          className={`flex h-11 items-center justify-center gap-1 rounded-lg border px-1 text-sm font-semibold disabled:opacity-50 ${
            value === st ? STATUS_STYLE[st] : "border-orc-line-strong bg-orc-field"
          }`}
        >
          <span aria-hidden>{objectiveStatusIcon[st]}</span>
          <span className="truncate">{objectiveStatusLabel[st]}</span>
        </button>
      ))}
    </div>
  );
}

function ObjectiveItem({
  objective: o,
  current,
  todayStatus,
  summary,
  history,
  note,
  sync,
  disabled,
  onMark,
  onNote,
}: {
  objective: Objective;
  current: ObjectiveStatus | null;
  todayStatus: ObjectiveStatus | null;
  summary: string;
  history: ObjectiveCheck[];
  note: string;
  sync: string | null;
  disabled: boolean;
  onMark: (s: ObjectiveStatus) => void;
  onNote: (note: string) => void;
}) {
  const [draft, setDraft] = useState(note);
  useEffect(() => setDraft(note), [note]);
  const border = current === "achieved" ? "border-orc-orange" : current === "in_progress" ? "border-amber-400" : "";
  return (
    <li className={`card space-y-2 p-3 ${border}`}>
      <details className="min-w-0">
        <summary className="cursor-pointer list-none">
          <span className="block font-semibold">{o.title}</span>
          <span className="block text-xs text-orc-muted">
            {summary}
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
          {history.length > 0 && (
            <div>
              <p className="font-semibold">Recorrido en la temporada</p>
              <ol className="mt-1 flex flex-wrap items-center gap-1" aria-label={`Recorrido: ${o.title}`}>
                {history.map((h, i) => {
                  const st = statusOf(h);
                  return (
                    <li key={h.id} className="flex items-center gap-1 text-xs">
                      {i > 0 && <span aria-hidden className="text-orc-muted">→</span>}
                      <span className={`chip ${st === "achieved" ? "tone-green" : st === "in_progress" ? "tone-amber" : ""}`}>
                        {objectiveStatusIcon[st]} {d(h.check_date)}
                        <span className="sr-only"> {objectiveStatusLabel[st]}</span>
                      </span>
                    </li>
                  );
                })}
              </ol>
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
      <StatusPicker value={todayStatus} onPick={onMark} disabled={disabled} label={o.title} />
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

  async function mark(playerIds: string[], status: ObjectiveStatus) {
    if (!canCheck) return;
    for (const pid of playerIds) {
      if (!consent.has(pid)) continue;
      const id = await objectiveCheckId(o.id, date, pid);
      const row: ObjectiveCheck = { id, objective_id: o.id, season_id: data.season.id, check_date: date, player_id: pid, status, achieved: status === "achieved", note: null };
      await saveLocalObjectiveCheck(row);
      await enqueue("objective_checks", { ...row });
    }
  }

  const states = new Map(players.map((p) => [p.id, objectiveState(checks, o.id, date, p.id)]));
  const done = players.filter((p) => states.get(p.id)?.status === "achieved").length;
  const inProg = players.filter((p) => states.get(p.id)?.status === "in_progress").length;
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
            <b className="text-lg tabular-nums">{done}</b> lo lograron · <b className="tabular-nums">{inProg}</b> en progreso · de {players.length}
          </span>
        </div>
        <ProgressBar done={done} inProgress={inProg} total={players.length} />
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
        <button type="button" className="btn-dark h-10" disabled={!canCheck || unmarkedToday.length === 0} onClick={() => void mark(unmarkedToday, "achieved")}>
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
              <div className="w-full sm:w-auto sm:min-w-80">
                <StatusPicker value={today ? statusOf(today) : null} onPick={(st) => void mark([p.id], st)} disabled={!canCheck || !ok} label={name} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
