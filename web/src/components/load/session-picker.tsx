"use client";

import { useState } from "react";
import type { FieldData } from "@/lib/offline/field-data";
import { addLocalSession } from "@/lib/offline/field-data";
import { enqueue } from "@/lib/offline/outbox";
import { randomId } from "@/lib/offline/ids";
import { formatDate, sessionTypeLabel } from "@/lib/labels";
import { localDate } from "@/lib/validation";
import type { EvaluationSession, SessionType } from "@/lib/types";
import { useSync } from "../sync-provider";

interface Props {
  data: FieldData;
  sessions: EvaluationSession[];
  initialCategoryId: string | null;
  onSelect: (sessionId: string) => void;
  onCreated: (session: EvaluationSession) => void;
  updatedAt: number | null;
  onRefresh: () => Promise<void>;
}

export function SessionPicker({ data, sessions, initialCategoryId, onSelect, onCreated, updatedAt, onRefresh }: Props) {
  const { online, items } = useSync();
  const [categoryId, setCategoryId] = useState(
    initialCategoryId && data.categories.some((c) => c.id === initialCategoryId)
      ? initialCategoryId
      : (data.categories[0]?.id ?? ""),
  );
  const [creating, setCreating] = useState(false);
  const pendingSessionIds = new Set(items.filter((i) => i.table === "evaluation_sessions").map((i) => i.row.id));
  const visible = sessions.filter((s) => s.category_id === categoryId);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const session: EvaluationSession = {
      id: randomId(),
      season_id: data.season.id,
      category_id: categoryId,
      session_type: f.get("session_type") as SessionType,
      session_date: String(f.get("session_date")),
      title: String(f.get("title") || "").trim() || null,
      location: null,
      opponent: String(f.get("opponent") || "").trim() || null,
    };
    await enqueue("evaluation_sessions", { ...session });
    await addLocalSession(session);
    onCreated(session);
  }

  return (
    <div className="space-y-4">
      {data.categories.length > 1 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Categoría">
          {data.categories.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={c.id === categoryId}
              onClick={() => setCategoryId(c.id)}
              className={`chip h-9 shrink-0 px-4 text-sm ${
                c.id === categoryId ? "bg-orc-black text-orc-orange" : "bg-orc-surface text-orc-ink ring-1 ring-orc-line-strong"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {creating ? (
        <form onSubmit={create} className="card space-y-3">
          <h2 className="font-bold">Nueva sesión</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="session_type">
                Tipo
              </label>
              <select id="session_type" name="session_type" className="field-input" defaultValue="testing">
                <option value="testing">Testeo</option>
                <option value="match">Partido</option>
                <option value="training">Entrenamiento</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="session_date">
                Fecha
              </label>
              <input id="session_date" name="session_date" type="date" required defaultValue={localDate()} className="field-input" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="title">
              Título (opcional)
            </label>
            <input id="title" name="title" placeholder="Ej.: Testeo pretemporada" className="field-input" />
          </div>
          <div>
            <label className="label" htmlFor="opponent">
              Rival (si es partido)
            </label>
            <input id="opponent" name="opponent" className="field-input" />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary flex-1">
              Crear y cargar
            </button>
            <button type="button" className="btn-ghost" onClick={() => setCreating(false)}>
              Cancelar
            </button>
          </div>
          {!online && <p className="text-xs text-orc-muted">Sin señal: la sesión se crea en el celular y se sube después.</p>}
        </form>
      ) : (
        <button type="button" className="btn-primary h-14 w-full text-base" onClick={() => setCreating(true)}>
          + Nueva sesión
        </button>
      )}

      <ul className="card divide-y divide-orc-line p-0">
        {visible.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onSelect(s.id)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-orc-orange-soft"
            >
              <span>
                <span className="font-semibold">{s.title ?? sessionTypeLabel[s.session_type]}</span>
                <span className="block text-xs text-orc-muted">
                  {sessionTypeLabel[s.session_type]}
                  {s.opponent && ` vs. ${s.opponent}`}
                </span>
              </span>
              <span className="flex items-center gap-2 text-sm text-orc-muted">
                {pendingSessionIds.has(s.id) && <span className="chip bg-orc-orange-soft text-orc-orange-strong">sin subir</span>}
                {formatDate(s.session_date)}
              </span>
            </button>
          </li>
        ))}
        {visible.length === 0 && <li className="px-4 py-6 text-center text-sm text-orc-muted">No hay sesiones recientes.</li>}
      </ul>

      <p className="flex items-center justify-between text-xs text-orc-muted">
        <span>
          Datos del celular actualizados{" "}
          {updatedAt ? new Date(updatedAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }) : "nunca"}
        </span>
        {online && (
          <button type="button" className="font-semibold text-orc-orange-strong" onClick={() => void onRefresh()}>
            Actualizar
          </button>
        )}
      </p>
    </div>
  );
}
