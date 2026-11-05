"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { loadCachedAttendance, refreshAttendance, saveCachedAttendance, type FieldData } from "@/lib/offline/field-data";
import { enqueue } from "@/lib/offline/outbox";
import { attendanceId } from "@/lib/offline/ids";
import { attendanceKindLabel, attendanceStatusLabel, countByStatus, type AttendanceKind, type AttendanceRow, type AttendanceStatus } from "@/lib/attendance";
import { clubToday } from "@/lib/validation";
import { useSync } from "./sync-provider";

const STATUS: { value: AttendanceStatus; short: string; on: string }[] = [
  { value: "present", short: "Presente", on: "border-green-600 bg-green-600 text-white" },
  { value: "absent", short: "Ausente", on: "border-red-600 bg-red-600 text-white" },
  { value: "excused", short: "Justif.", on: "border-amber-500 bg-amber-500 text-orc-black" },
];

/** Tomar asistencia de la categoría en un día. Funciona sin señal. */
export function AttendanceTab({ data, categoryId, date, readOnly = false }: { data: FieldData; categoryId: string; date: string; readOnly?: boolean }) {
  const { items, lastSyncAt } = useSync();
  const [server, setServer] = useState<AttendanceRow[]>([]);
  const [kind, setKind] = useState<AttendanceKind>("practice");
  const today = clubToday();
  const editable = date <= today && !readOnly;

  const players = useMemo(
    () => data.roster.filter((p) => p.category_id === categoryId).sort((a, b) => a.last_name.localeCompare(b.last_name)),
    [data, categoryId],
  );

  const load = useCallback(async () => {
    const cached = await loadCachedAttendance(categoryId, date);
    setServer(cached);
    if (navigator.onLine) {
      try {
        setServer(await refreshAttendance(supabaseBrowser(), categoryId, date));
      } catch {
        /* sin señal */
      }
    }
  }, [categoryId, date]);
  useEffect(() => {
    void load();
  }, [load, lastSyncAt]);

  const pending = useMemo(
    () =>
      items
        .filter((i) => i.table === "attendance")
        .map((i) => ({ row: i.row as unknown as AttendanceRow, item: i }))
        .filter((p) => p.row.category_id === categoryId && p.row.att_date === date),
    [items, categoryId, date],
  );
  const byPlayer = useMemo(() => {
    const m = new Map<string, AttendanceRow>();
    for (const r of server) m.set(r.player_id, r);
    for (const p of pending) m.set(p.row.player_id, p.row);
    return m;
  }, [server, pending]);

  // El tipo (práctica/partido) sale de lo ya tomado ese día.
  useEffect(() => {
    const first = [...byPlayer.values()][0];
    setKind(first?.kind ?? "practice");
    // sólo al cambiar de día/categoría
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId, date, server.length > 0]);

  async function save(rows: AttendanceRow[]) {
    const next = new Map(byPlayer);
    for (const r of rows) next.set(r.player_id, r);
    await saveCachedAttendance(categoryId, date, [...next.values()]);
    setServer([...next.values()]);
    for (const r of rows) await enqueue("attendance", { ...r });
  }

  async function row(playerId: string, status: AttendanceStatus, k: AttendanceKind = kind): Promise<AttendanceRow> {
    return {
      id: await attendanceId(playerId, categoryId, date),
      player_id: playerId,
      category_id: categoryId,
      season_id: data.season.id,
      att_date: date,
      kind: k,
      status,
      note: byPlayer.get(playerId)?.note ?? null,
    };
  }

  async function mark(playerId: string, status: AttendanceStatus) {
    if (!editable) return;
    await save([await row(playerId, status)]);
  }

  async function allPresent() {
    if (!editable) return;
    const rows = await Promise.all(players.filter((p) => !byPlayer.has(p.id)).map((p) => row(p.id, "present")));
    if (rows.length) await save(rows);
  }

  async function changeKind(k: AttendanceKind) {
    setKind(k);
    if (!editable) return;
    const marked = [...byPlayer.values()].filter((r) => r.kind !== k);
    if (marked.length) await save(await Promise.all(marked.map((r) => row(r.player_id, r.status, k))));
  }

  const c = countByStatus([...byPlayer.values()].filter((r) => players.some((p) => p.id === r.player_id)));
  const unmarked = players.filter((p) => !byPlayer.has(p.id)).length;

  if (players.length === 0) return <p className="card text-sm">No hay jugadores en esta categoría para la temporada.</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-orc-line-strong p-0.5" role="radiogroup" aria-label="Tipo">
          {(["practice", "match"] as AttendanceKind[]).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => void changeKind(k)}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold ${kind === k ? "bg-orc-orange text-orc-black" : ""}`}
            >
              {attendanceKindLabel[k]}
            </button>
          ))}
        </div>
        <button type="button" className="btn-dark h-10" disabled={!editable || unmarked === 0} onClick={() => void allPresent()}>
          {unmarked === 0 ? "Todos marcados" : unmarked === players.length ? "Todos presentes" : `Resto presentes (${unmarked})`}
        </button>
      </div>

      <section className="card grid grid-cols-4 gap-1 py-3 text-center" aria-label="Totales">
        <Total n={c.present} label="presentes" tone="text-green-700 dark:text-green-400" />
        <Total n={c.absent} label="ausentes" tone="text-red-700 dark:text-red-400" />
        <Total n={c.excused} label="justif." tone="text-amber-700 dark:text-amber-400" />
        <Total n={unmarked} label="sin marcar" tone="text-orc-muted" />
      </section>

      <ul className="card divide-y divide-orc-line p-0">
        {players.map((p) => {
          const r = byPlayer.get(p.id);
          const pend = pending.find((x) => x.row.player_id === p.id)?.item;
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">
                  {p.jersey_number != null && <span className="mr-1 text-xs text-orc-muted tabular-nums">#{p.jersey_number}</span>}
                  {p.last_name}, {p.first_name}
                </span>
                {pend && (
                  <span className={`chip mt-0.5 text-xs ${pend.status === "error" ? "tone-red" : "tone-amber"}`}>
                    {pend.status === "error" ? `No se pudo subir: ${pend.error}` : "Sin subir"}
                  </span>
                )}
              </span>
              <span className="flex gap-1" role="radiogroup" aria-label={`Asistencia de ${p.last_name}, ${p.first_name}`}>
                {STATUS.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    role="radio"
                    aria-checked={r?.status === s.value}
                    aria-label={`${attendanceStatusLabel[s.value]}: ${p.last_name}, ${p.first_name}`}
                    disabled={!editable}
                    onClick={() => void mark(p.id, s.value)}
                    className={`h-10 rounded-lg border px-2.5 text-sm font-semibold ${r?.status === s.value ? s.on : "border-orc-line-strong bg-orc-field"}`}
                  >
                    {s.short}
                  </button>
                ))}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-orc-muted">
        Justificado (enfermedad, examen, viaje) no cuenta como falta. La asistencia % es presentes sobre presentes + ausentes.
      </p>
    </div>
  );
}

function Total({ n, label, tone }: { n: number; label: string; tone: string }) {
  return (
    <span>
      <b className={`block text-2xl tabular-nums ${tone}`}>{n}</b>
      <span className="text-xs text-orc-muted">{label}</span>
    </span>
  );
}
