"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { hasConsent, loadCachedWellness, refreshWellness, saveCachedWellness } from "@/lib/offline/field-data";
import { enqueue } from "@/lib/offline/outbox";
import { wellnessId } from "@/lib/offline/ids";
import { localDate } from "@/lib/validation";
import type { RosterPlayer, WellnessLog } from "@/lib/types";
import { useFieldData } from "./use-field-data";
import { useSync } from "./sync-provider";

// Escalas 1–5: 5 = mejor estado (coincide con la base).
const ITEMS = [
  { key: "sleep_quality", label: "Calidad de sueño", low: "Muy mala", high: "Excelente" },
  { key: "fatigue", label: "Fatiga", low: "Agotado", high: "Fresco" },
  { key: "soreness", label: "Dolor muscular", low: "Mucho", high: "Nada" },
  { key: "stress", label: "Estrés", low: "Muy alto", high: "Relajado" },
  { key: "mood", label: "Ánimo", low: "Muy bajo", high: "Muy bueno" },
] as const;

type Form = Partial<Pick<WellnessLog, "sleep_hours" | "sleep_quality" | "fatigue" | "soreness" | "stress" | "mood" | "session_rpe" | "session_minutes">>;

export function WellnessScreen() {
  const { data, loading } = useFieldData();
  const { items } = useSync();
  const [categoryId, setCategoryId] = useState<string>("");
  const [date, setDate] = useState(localDate());
  const [server, setServer] = useState<WellnessLog[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (data && !categoryId) setCategoryId(data.categories[0]?.id ?? "");
  }, [data, categoryId]);

  const players = useMemo(
    () => (data?.roster ?? []).filter((p) => p.category_id === categoryId),
    [data, categoryId],
  );

  useEffect(() => {
    if (!categoryId) return;
    let cancelled = false;
    (async () => {
      setServer(await loadCachedWellness(categoryId, date));
      if (navigator.onLine) {
        try {
          const fresh = await refreshWellness(supabaseBrowser(), players.map((p) => p.id), categoryId, date);
          if (!cancelled) setServer(fresh);
        } catch {
          /* offline */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [categoryId, date, players]);

  const pendingByPlayer = useMemo(() => {
    const map = new Map<string, (typeof items)[number]>();
    for (const i of items) if (i.table === "wellness_logs" && i.row.log_date === date) map.set(String(i.row.player_id), i);
    return map;
  }, [items, date]);

  // Lo que se sube sale de la outbox: pasarlo a `server` para que no "desaparezca".
  const prevPending = useRef(pendingByPlayer);
  useEffect(() => {
    const prev = prevPending.current;
    prevPending.current = pendingByPlayer;
    const synced = [...prev.entries()].filter(([pid, i]) => !pendingByPlayer.has(pid) && i.status === "pending");
    if (synced.length === 0) return;
    setServer((rows) => {
      const byPlayer = new Map(rows.map((r) => [r.player_id, r]));
      for (const [pid, i] of synced) byPlayer.set(pid, i.row as unknown as WellnessLog);
      const next = [...byPlayer.values()];
      if (categoryId) void saveCachedWellness(categoryId, date, next);
      return next;
    });
  }, [pendingByPlayer, categoryId, date]);

  if (loading && !data) return <p className="py-10 text-center text-orc-muted">Cargando…</p>;
  if (!data) {
    return (
      <p className="card mt-6 text-center text-sm text-orc-muted">
        Abrí esta pantalla una vez con señal para descargar los planteles.
      </p>
    );
  }

  const done = players.filter((p) => pendingByPlayer.has(p.id) || server.some((w) => w.player_id === p.id)).length;

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-end gap-3 p-3">
        {data.categories.length > 1 && (
          <div className="min-w-40 flex-1">
            <label className="label" htmlFor="cat">
              Categoría
            </label>
            <select id="cat" className="field-input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {data.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="label" htmlFor="date">
            Fecha
          </label>
          <input id="date" type="date" className="field-input" value={date} max={localDate()} onChange={(e) => setDate(e.target.value)} />
        </div>
        <p className="ml-auto text-sm tabular-nums text-orc-muted">
          {done}/{players.length} registrados
        </p>
      </div>

      <ul className="space-y-2">
        {players.map((p) => {
          const pending = pendingByPlayer.get(p.id);
          const existing = server.find((w) => w.player_id === p.id);
          const current = (pending?.row ?? existing) as WellnessLog | undefined;
          const consentOk = hasConsent(data.consents, p.id, "performance_data");
          return (
            <li key={p.id} className="card p-0">
              <button
                type="button"
                disabled={!consentOk}
                onClick={() => setOpen(open === p.id ? null : p.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left disabled:opacity-60"
                aria-expanded={open === p.id}
              >
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {p.last_name}, {p.first_name}
                </span>
                {!consentOk ? (
                  <span className="chip bg-amber-100 text-amber-900">Sin consentimiento</span>
                ) : pending?.status === "error" ? (
                  <span className="chip bg-red-100 text-red-800" title={pending.error}>
                    Error
                  </span>
                ) : pending ? (
                  <span className="chip bg-orc-orange-soft text-orc-orange-strong">Sin subir</span>
                ) : current ? (
                  <span className="chip bg-green-100 text-green-800">
                    {score(current) !== null ? `${score(current)}/25` : "✓"}
                  </span>
                ) : (
                  <span className="text-sm text-orc-muted">Cargar ›</span>
                )}
              </button>
              {open === p.id && consentOk && (
                <WellnessForm
                  player={p}
                  date={date}
                  initial={current}
                  existingId={existing?.id}
                  error={pending?.status === "error" ? pending.error : undefined}
                  onSaved={() => {
                    const idx = players.findIndex((x) => x.id === p.id);
                    setOpen(players[idx + 1]?.id ?? null);
                  }}
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function score(w: Form): number | null {
  const vals = ITEMS.map((i) => w[i.key]);
  return vals.every((v) => typeof v === "number") ? (vals as number[]).reduce((a, b) => a + b, 0) : null;
}

function WellnessForm({
  player,
  date,
  initial,
  existingId,
  error,
  onSaved,
}: {
  player: RosterPlayer;
  date: string;
  initial?: Form;
  existingId?: string;
  error?: string;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Form>(() => ({ ...initial }));
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    // Si ya existe en el servidor se reutiliza su id; si no, id determinista (jugador+fecha).
    const id = existingId ?? (await wellnessId(player.id, date));
    await enqueue("wellness_logs", {
      id,
      player_id: player.id,
      log_date: date,
      sleep_hours: form.sleep_hours ?? null,
      sleep_quality: form.sleep_quality ?? null,
      fatigue: form.fatigue ?? null,
      soreness: form.soreness ?? null,
      stress: form.stress ?? null,
      mood: form.mood ?? null,
      session_rpe: form.session_rpe ?? null,
      session_minutes: form.session_minutes ?? null,
      recorded_at: new Date().toISOString(),
      deleted_at: null,
    });
    onSaved();
  }

  const num = (v: string, max: number, decimals = 0) => {
    const n = Number(v.replace(",", "."));
    if (v.trim() === "" || Number.isNaN(n)) return null;
    return Math.min(max, Math.max(0, decimals ? Math.round(n * 10) / 10 : Math.round(n)));
  };

  return (
    <div className="space-y-4 border-t border-orc-line px-4 py-4">
      {error && <p className="rounded-md bg-red-50 p-2 text-sm text-bad">{error}</p>}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="label" htmlFor={`sleep-${player.id}`}>
            Horas de sueño
          </label>
          <input
            id={`sleep-${player.id}`}
            inputMode="decimal"
            className="field-input"
            defaultValue={form.sleep_hours ?? ""}
            onBlur={(e) => set("sleep_hours", num(e.target.value, 16, 1))}
          />
        </div>
        <div>
          <label className="label" htmlFor={`rpe-${player.id}`}>
            RPE (0–10)
          </label>
          <select
            id={`rpe-${player.id}`}
            className="field-input"
            value={form.session_rpe ?? ""}
            onChange={(e) => set("session_rpe", e.target.value === "" ? null : Number(e.target.value))}
          >
            <option value="">—</option>
            {Array.from({ length: 11 }, (_, i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`min-${player.id}`}>
            Minutos
          </label>
          <input
            id={`min-${player.id}`}
            inputMode="numeric"
            className="field-input"
            defaultValue={form.session_minutes ?? ""}
            onBlur={(e) => set("session_minutes", num(e.target.value, 600))}
          />
        </div>
      </div>

      {ITEMS.map((item) => (
        <fieldset key={item.key}>
          <legend className="label">{item.label}</legend>
          <div className="grid grid-cols-5 gap-1.5">
            {[1, 2, 3, 4, 5].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => set(item.key, v)}
                aria-pressed={form[item.key] === v}
                className={`h-11 rounded-lg text-lg font-bold ${
                  form[item.key] === v ? "bg-orc-orange text-orc-black" : "bg-orc-bg text-orc-ink"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          <div className="mt-0.5 flex justify-between text-[11px] text-orc-muted">
            <span>{item.low}</span>
            <span>{item.high}</span>
          </div>
        </fieldset>
      ))}

      <button type="button" className="btn-primary w-full" onClick={() => void save()}>
        Guardar y siguiente
      </button>
    </div>
  );
}
