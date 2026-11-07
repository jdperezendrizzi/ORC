"use client";

import { useMemo, useState } from "react";
import { methodLabel } from "@/lib/field-tests/protocol";
import type { RosterPlayer, TestAttempt } from "@/lib/types";
import { formatValue } from "@/lib/validation";
import type { CheckResult, FieldTestCtx } from "./use-field-test";

export const playerName = (p: Pick<RosterPlayer, "first_name" | "last_name">) => `${p.last_name}, ${p.first_name}`;

/** Lista de jugadores de la categoría con lo cargado hoy. */
export function PlayerPicker({ ctx, onSelect, hint }: { ctx: FieldTestCtx; onSelect: (p: RosterPlayer) => void; hint?: (p: RosterPlayer) => string | null }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? ctx.roster.filter((p) => `${p.first_name} ${p.last_name}`.toLowerCase().includes(s)) : ctx.roster;
  }, [ctx.roster, q]);
  const primary = ctx.metrics.find((m) => m.is_primary) ?? ctx.metrics[0];
  return (
    <section className="space-y-2" aria-label="Jugadores">
      <input className="field-input h-11 w-full" placeholder="Buscar jugador…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar jugador" />
      <ul className="card divide-y divide-orc-line p-0">
        {list.map((p) => {
          const n = ctx.attempts.filter((a) => a.player_id === p.id && !ctx.voids.has(a.id)).length;
          const best = primary ? ctx.bestFor(p.id).get(primary.code) : undefined;
          const extra = hint?.(p);
          return (
            <li key={p.id}>
              <button type="button" onClick={() => onSelect(p)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                <span>
                  <span className="font-semibold">{playerName(p)}</span>
                  {extra && <span className="block text-xs text-orc-muted">{extra}</span>}
                </span>
                <span className="shrink-0 text-right text-sm">
                  {n > 0 ? (
                    <>
                      <span className="block font-bold tabular-nums">
                        {best !== undefined && primary ? `${formatValue(best, primary.decimals)} ${primary.unit}` : "—"}
                      </span>
                      <span className="text-xs text-orc-muted">
                        {n} {n === 1 ? "intento" : "intentos"}
                      </span>
                    </>
                  ) : (
                    <span className="text-xs text-orc-muted">Sin datos hoy</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
        {list.length === 0 && <li className="px-4 py-3 text-sm text-orc-muted">Nadie con ese nombre.</li>}
      </ul>
    </section>
  );
}

/** Estado de un intento: siempre ícono + texto. */
function AttemptStatus({ ctx, a }: { ctx: FieldTestCtx; a: TestAttempt }) {
  const v = ctx.voids.get(a.id);
  const err = ctx.errorById.get(a.id);
  if (v) return <span className="chip text-xs">✕ Anulado: {v.reason}</span>;
  if (err) return <span className="chip tone-red text-xs">⚠ No se subió: {err}</span>;
  if (ctx.pendingIds.has(a.id)) return <span className="chip tone-amber text-xs">⏳ Por subir</span>;
  return <span className="chip tone-green text-xs">✓ Guardado</span>;
}

/** Intentos del jugador en la sesión, con anulación (corregir = anular + cargar otro). */
export function AttemptsList({ ctx, player, render }: { ctx: FieldTestCtx; player: RosterPlayer; render?: (a: TestAttempt) => React.ReactNode }) {
  const list = ctx.attempts.filter((a) => a.player_id === player.id);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const best = ctx.bestFor(player.id);
  const methods = new Set(list.filter((a) => !ctx.voids.has(a.id)).map((a) => a.method));
  if (list.length === 0) return <p className="text-sm text-orc-muted">Todavía no hay intentos de {player.first_name} en esta fecha.</p>;
  return (
    <section className="space-y-2" aria-label="Intentos">
      {methods.size > 1 && (
        <p className="rounded-lg border border-amber-500 px-3 py-2 text-sm" role="note">
          <span aria-hidden>⚠ </span>Hay intentos medidos con métodos distintos ({[...methods].map((m) => methodLabel[m]).join(", ")}): no son del todo comparables.
        </p>
      )}
      <ul className="divide-y divide-orc-line">
        {list.map((a) => {
          const vals = ctx.valuesOf(a);
          const voided = ctx.voids.has(a.id);
          return (
            <li key={a.id} className="space-y-1 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={`text-sm ${voided ? "text-orc-muted line-through" : ""}`}>
                  <b>#{a.attempt}</b> · {methodLabel[a.method]} ·{" "}
                  {vals.length
                    ? vals.map((v) => (
                        <span key={v.code} className="mr-2 tabular-nums">
                          {v.metric.name.replace(/^.*· /, "")}: <b>{formatValue(v.value, v.metric.decimals)}</b> {v.metric.unit}
                          {!voided && best.get(v.code) === v.value && v.metric.best_of !== "avg" && <span className="ml-1 text-xs">★ mejor</span>}
                        </span>
                      ))
                    : "sin resultado"}
                </span>
                <AttemptStatus ctx={ctx} a={a} />
              </div>
              {render?.(a)}
              {a.notes && <p className="text-xs text-orc-muted">{a.notes}</p>}
              {!voided &&
                (voiding === a.id ? (
                  <form
                    className="flex flex-wrap items-end gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (reason.trim().length < 3) return;
                      void ctx.annul(a.id, reason).then(() => {
                        setVoiding(null);
                        setReason("");
                      });
                    }}
                  >
                    <label className="flex flex-1 flex-col text-sm">
                      <span className="label">Motivo de la anulación</span>
                      <input className="field-input h-10" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej.: dobló las rodillas al caer" autoFocus minLength={3} required />
                    </label>
                    <button type="submit" className="btn-dark h-10" disabled={reason.trim().length < 3}>
                      Anular
                    </button>
                    <button type="button" className="btn-ghost h-10" onClick={() => setVoiding(null)}>
                      Cancelar
                    </button>
                  </form>
                ) : (
                  <button type="button" className="text-xs font-semibold text-orc-orange-strong underline" onClick={() => setVoiding(a.id)}>
                    Anular intento #{a.attempt}
                  </button>
                ))}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Guardar con chequeo: un error frena; un valor raro pide "Guardar igual". */
export function SaveButton({ check, onSave, label = "Guardar intento", disabled }: { check: CheckResult | null; onSave: () => Promise<void>; label?: string; disabled?: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      await onSave();
      setConfirming(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const blocked = disabled || !check || !!check.error || busy;
  return (
    <div className="space-y-2">
      {check?.error && (
        <p className="text-sm text-red-700 dark:text-red-400" role="alert">
          <span aria-hidden>⛔ </span>
          {check.error}
        </p>
      )}
      {confirming && check?.warnings.length ? (
        <div className="space-y-2 rounded-lg border border-amber-500 p-3" role="alert">
          {check.warnings.map((w) => (
            <p key={w} className="text-sm">
              <span aria-hidden>⚠ </span>
              {w}
            </p>
          ))}
          <div className="flex gap-2">
            <button type="button" className="btn-primary h-11" disabled={busy} onClick={() => void run()}>
              Guardar igual
            </button>
            <button type="button" className="btn-ghost h-11" onClick={() => setConfirming(false)}>
              Revisar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="btn-primary h-12 w-full"
          disabled={blocked}
          onClick={() => (check?.warnings.length ? setConfirming(true) : void run())}
        >
          {busy ? "Guardando…" : label}
        </button>
      )}
      {err && (
        <p className="text-sm text-red-700 dark:text-red-400" role="alert">
          <span aria-hidden>⛔ </span>
          {err}
        </p>
      )}
    </div>
  );
}

/** Valores calculados en vivo (antes de guardar). */
export function LivePreview({ check }: { check: CheckResult | null }) {
  if (!check || check.values.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-3" aria-live="polite">
      {check.values.map((v) => (
        <div key={v.code} className="rounded-lg bg-orc-chip px-3 py-2">
          <p className="text-xs text-orc-muted">{v.metric.name}</p>
          <p className="text-xl font-black tabular-nums">
            {formatValue(v.value, v.metric.decimals)} <span className="text-sm font-semibold">{v.metric.unit}</span>
          </p>
        </div>
      ))}
    </div>
  );
}

/** Selector segmentado (accesible). */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string; disabled?: boolean }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="inline-flex flex-wrap rounded-lg border border-orc-line-strong p-0.5" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1.5 text-sm font-semibold disabled:opacity-40 ${value === o.value ? "bg-orc-orange text-orc-black" : ""}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
