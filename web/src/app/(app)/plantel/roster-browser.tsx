"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { injuryStatusLabel, injuryStatusTone } from "@/lib/labels";

export interface RosterRow {
  id: string;
  name: string;
  categoryId: string;
  categoryCode: string;
  jersey: number | null;
  position: string | null;
  unit: "forwards" | "backs" | null;
  age: number;
  attendancePct: number | null;
  injury: string | null;
  noConsent: boolean;
  objectives: { done: number; total: number } | null;
}

const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Lista de jugadores con buscador, categorías y filtros (los filtros quedan en la URL). */
export function RosterBrowser({
  rows,
  categories,
  showAttendance,
  showInjuries,
}: {
  rows: RosterRow[];
  categories: { id: string; code: string; name: string }[];
  showAttendance: boolean;
  showInjuries: boolean;
}) {
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [cat, setCat] = useState(params.get("cat") ?? (categories.length === 1 ? categories[0].id : ""));
  const [unit, setUnit] = useState(params.get("unidad") ?? "");
  const [onlyInjured, setOnlyInjured] = useState(params.get("lesionados") === "1");
  const [onlyNoConsent, setOnlyNoConsent] = useState(params.get("sinconsent") === "1");

  useEffect(() => {
    const u = new URL(window.location.href);
    const set = (k: string, v: string) => (v ? u.searchParams.set(k, v) : u.searchParams.delete(k));
    set("q", q);
    set("cat", cat);
    set("unidad", unit);
    set("lesionados", onlyInjured ? "1" : "");
    set("sinconsent", onlyNoConsent ? "1" : "");
    window.history.replaceState(window.history.state, "", u);
  }, [q, cat, unit, onlyInjured, onlyNoConsent]);

  const count = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.categoryId, (m.get(r.categoryId) ?? 0) + 1);
    return m;
  }, [rows]);

  const filtered = useMemo(() => {
    const term = norm(q.trim());
    return rows
      .filter((r) => !term || norm(r.name).includes(term) || (r.jersey !== null && String(r.jersey) === term))
      .filter((r) => !cat || r.categoryId === cat)
      .filter((r) => !unit || r.unit === unit)
      .filter((r) => !onlyInjured || r.injury)
      .filter((r) => !onlyNoConsent || r.noConsent)
      .sort((a, b) => (cat ? 0 : a.categoryCode.localeCompare(b.categoryCode, "es", { numeric: true })) || a.name.localeCompare(b.name));
  }, [rows, q, cat, unit, onlyInjured, onlyNoConsent]);

  const selected = categories.find((c) => c.id === cat);

  return (
    <section className="space-y-3" aria-label="Jugadores">
      <div className="card space-y-3 p-3">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nombre o n.º de camiseta…"
          aria-label="Buscar jugador"
          className="field-input"
        />
        {categories.length > 1 && (
          <label className="block">
            <span className="label">Categoría</span>
            <select value={cat} onChange={(e) => setCat(e.target.value)} className="field-input" aria-label="Categoría">
              <option value="">Todas las categorías ({rows.length})</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({count.get(c.id) ?? 0})
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <select value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Forwards o backs" className="field-input h-10 w-auto text-sm">
            <option value="">Forwards y backs</option>
            <option value="forwards">Forwards</option>
            <option value="backs">Backs</option>
          </select>
          {showInjuries && (
            <label className="flex items-center gap-2 font-medium">
              <input type="checkbox" checked={onlyInjured} onChange={(e) => setOnlyInjured(e.target.checked)} className="size-5 accent-orc-orange" />
              Lesionados
            </label>
          )}
          <label className="flex items-center gap-2 font-medium">
            <input type="checkbox" checked={onlyNoConsent} onChange={(e) => setOnlyNoConsent(e.target.checked)} className="size-5 accent-orc-orange" />
            Sin consentimiento
          </label>
          <span className="ml-auto text-orc-muted" aria-live="polite">
            {filtered.length} {filtered.length === 1 ? "jugador" : "jugadores"}
          </span>
        </div>
      </div>

      {selected && (
        <a href={`/categorias/${selected.id}`} className="card flex items-center gap-3 py-3 hover:border-orc-orange">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-orc-black text-xs font-black text-orc-orange">
            {selected.code.length > 4 ? selected.code.slice(0, 3) : selected.code}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{selected.name}</span>
            <span className="text-sm text-orc-muted">Marcas, resumen de la semana, alertas y evaluación de pase</span>
          </span>
          <span className="text-orc-muted">›</span>
        </a>
      )}
      {selected && (
        <a href={`/plantel/estado?categoria=${selected.id}`} className="btn-ghost h-11 w-full">
          Estado del equipo de {selected.code} · compartir
        </a>
      )}

      {filtered.length === 0 ? (
        <p className="card text-sm">
          {selected && (count.get(selected.id) ?? 0) === 0
            ? `Todavía no hay jugadores cargados en ${selected.name}. Se cargan desde Admin › Jugadores › Importar plantel.`
            : "Ningún jugador coincide con la búsqueda."}
        </p>
      ) : (
        <ul className="card divide-y divide-orc-line p-0">
          {filtered.map((r) => (
            <li key={`${r.categoryId}-${r.id}`}>
              <a href={`/jugadores/${r.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-orc-orange-soft">
                <span className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-orc-orange text-sm font-black tabular-nums">
                  {r.jersey ?? "–"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{r.name}</span>
                  <span className="block text-xs text-orc-muted">
                    {!cat && `${r.categoryCode} · `}
                    {r.position ?? "Sin puesto"} · {r.age} años
                    {showAttendance && r.attendancePct !== null && ` · asistencia ${r.attendancePct}%`}
                    {r.objectives && ` · objetivos ${r.objectives.done}/${r.objectives.total}`}
                  </span>
                </span>
                <span className="flex shrink-0 flex-wrap justify-end gap-1">
                  {showInjuries && r.injury && <span className={`chip text-xs ${injuryStatusTone[r.injury]}`}>{injuryStatusLabel[r.injury]}</span>}
                  {r.noConsent && <span className="chip tone-amber text-xs">Sin consent.</span>}
                </span>
                <span className="text-orc-muted" aria-hidden>
                  ›
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
