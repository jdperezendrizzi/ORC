"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Beeper } from "@/lib/field-tests/beeper";
import {
  allOut,
  buildSchedule,
  finalStages,
  initRun,
  lastLineBefore,
  markRun,
  phaseAt,
  stageSpeedKmh,
  undoRun,
  vift,
  type IftMark,
  type IftRunState,
} from "@/lib/field-tests/ift";
import type { IftParams } from "@/lib/field-tests/protocol";
import type { RosterPlayer } from "@/lib/types";
import { formatValue } from "@/lib/validation";
import { FieldTestFrame } from "./test-frame";
import { AttemptsList, LivePreview, PlayerPicker, SaveButton, Segmented, playerName } from "./parts";
import type { FieldTestCtx } from "./use-field-test";

type Mode = "run" | "manual";

export function IftScreen() {
  return <FieldTestFrame code="ift_30_15" title="30-15 IFT">{(ctx) => <IftBody ctx={ctx} />}</FieldTestFrame>;
}

function IftBody({ ctx }: { ctx: FieldTestCtx<"ift_30_15"> }) {
  const [mode, setMode] = useState<Mode>("run");
  const p = ctx.params;
  return (
    <>
      <p className="text-sm text-orc-muted">
        Etapas de {p.run_s} s de carrera + {p.rest_s} s de pausa. Arranca a {p.start_kmh} km/h y sube {formatValue(p.step_kmh, 1)} km/h por etapa. Ida y vuelta de{" "}
        {p.shuttle_m} m con una línea cada {p.line_every_m} m (zona de tolerancia de {p.tolerance_m} m). VIFT = velocidad de la última etapa completa.
      </p>
      <Segmented<Mode>
        label="Modo"
        value={mode}
        onChange={setMode}
        options={[
          { value: "run", label: "Correr con la app" },
          { value: "manual", label: "Cargar etapa" },
        ]}
      />
      {mode === "run" ? <IftRun ctx={ctx} /> : <IftManual ctx={ctx} />}
    </>
  );
}

// ---------------------------------------------------------------------
// Carga manual de la etapa
// ---------------------------------------------------------------------
function IftManual({ ctx }: { ctx: FieldTestCtx<"ift_30_15"> }) {
  const [player, setPlayer] = useState<RosterPlayer | null>(null);
  const [raw, setRaw] = useState("");
  if (!player) return <PlayerPicker ctx={ctx} onSelect={setPlayer} />;
  const stage = /^\d+$/.test(raw.trim()) ? Number(raw) : null;
  const inputs = stage === null ? null : { lastStage: stage };
  const check = inputs ? ctx.check(player, "manual", inputs) : raw.trim() ? { values: [], error: "Escribí el número de etapa (entero).", warnings: [] } : null;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-bold">{playerName(player)}</h2>
        <button type="button" className="btn-ghost h-10 shrink-0 whitespace-nowrap" onClick={() => setPlayer(null)}>
          Cambiar jugador
        </button>
      </div>
      <section className="card space-y-3">
        <label className="flex flex-col text-sm">
          <span className="label">Última etapa completa</span>
          <input className="field-input h-12 text-lg" inputMode="numeric" placeholder="Ej.: 17" value={raw} onChange={(e) => setRaw(e.target.value)} autoFocus />
        </label>
        {stage === 0 && <p className="text-sm">Sin la etapa 1 completa no hay VIFT: el intento queda registrado sin resultado.</p>}
        <LivePreview check={check} />
        <SaveButton
          check={check}
          disabled={!inputs}
          onSave={async () => {
            await ctx.save(player, "manual", inputs!);
            setRaw("");
          }}
        />
      </section>
      <section className="card">
        <AttemptsList ctx={ctx} player={player} />
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------
// Corrida con señales de la app
// ---------------------------------------------------------------------
const RUN_KEY = "orc-ift-run";
const RESUME_MS = 15_000;

interface Snapshot {
  v: 1;
  categoryId: string;
  date: string;
  epochStart: number; // Date.now() del inicio de la etapa 1
  playerIds: string[];
  marks: IftMark[];
  heartbeat: number;
}

const readSnap = (): Snapshot | null => {
  try {
    const s = JSON.parse(localStorage.getItem(RUN_KEY) ?? "null") as Snapshot | null;
    return s?.v === 1 ? s : null;
  } catch {
    return null;
  }
};
const writeSnap = (s: Snapshot | null) => {
  try {
    if (s) localStorage.setItem(RUN_KEY, JSON.stringify(s));
    else localStorage.removeItem(RUN_KEY);
  } catch {
    /* sin almacenamiento */
  }
};
/** Al cerrar sesión: corta y borra la corrida. */
export const clearIftRun = () => writeSnap(null);

interface Result {
  playerId: string;
  lastStage: number;
  reason: string;
  interrupted: boolean;
  misses: number[];
}

function IftRun({ ctx }: { ctx: FieldTestCtx<"ift_30_15"> }) {
  const p = ctx.params;
  const categoryId = ctx.category!.id;
  const [selected, setSelected] = useState<Set<string>>(() => new Set(ctx.roster.map((r) => r.id)));
  const [phase, setPhase] = useState<"setup" | "running" | "review">("setup");
  const [results, setResults] = useState<Result[]>([]);
  const [startAt, setStartAt] = useState<{ ms: number; snap: Snapshot } | null>(null);
  const [pendingSnap, setPendingSnap] = useState<Snapshot | null>(null);

  useEffect(() => {
    const s = readSnap();
    if (s && s.categoryId === categoryId && s.date === ctx.date) setPendingSnap(s);
  }, [categoryId, ctx.date]);

  const start = () => {
    const snap: Snapshot = { v: 1, categoryId, date: ctx.date, epochStart: Date.now() + p.lead_in_s * 1000, playerIds: [...selected], marks: [], heartbeat: Date.now() };
    writeSnap(snap);
    setStartAt({ ms: -p.lead_in_s * 1000, snap });
    setPhase("running");
  };

  if (phase === "running" && startAt) {
    return (
      <Runner
        ctx={ctx}
        params={p}
        snap={startAt.snap}
        startMs={startAt.ms}
        onEnd={(r) => {
          setResults(r);
          setPhase("review");
        }}
      />
    );
  }
  if (phase === "review") {
    return (
      <Review
        ctx={ctx}
        results={results}
        onDone={() => {
          writeSnap(null);
          setResults([]);
          setPhase("setup");
        }}
      />
    );
  }

  return (
    <div className="space-y-3">
      {pendingSnap && (
        <ResumeCard
          snap={pendingSnap}
          params={p}
          onResume={() => {
            setStartAt({ ms: Date.now() - pendingSnap.epochStart, snap: pendingSnap });
            setPendingSnap(null);
            setPhase("running");
          }}
          onFinish={(r) => {
            setPendingSnap(null);
            setResults(r);
            setPhase("review");
          }}
          onDiscard={() => {
            writeSnap(null);
            setPendingSnap(null);
          }}
        />
      )}
      <section className="card space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold">¿Quiénes corren? ({selected.size})</h2>
          <button
            type="button"
            className="text-sm font-semibold underline"
            onClick={() => setSelected(selected.size === ctx.roster.length ? new Set() : new Set(ctx.roster.map((r) => r.id)))}
          >
            {selected.size === ctx.roster.length ? "Ninguno" : "Todos"}
          </button>
        </div>
        <ul className="grid gap-1 sm:grid-cols-2">
          {ctx.roster.map((r) => (
            <li key={r.id}>
              <label className="flex items-center gap-2 py-1 text-sm">
                <input
                  type="checkbox"
                  className="size-5 accent-orc-orange"
                  checked={selected.has(r.id)}
                  onChange={(e) => {
                    const n = new Set(selected);
                    if (e.target.checked) n.add(r.id);
                    else n.delete(r.id);
                    setSelected(n);
                  }}
                />
                {playerName(r)}
              </label>
            </li>
          ))}
        </ul>
      </section>
      <p className="rounded-lg border border-amber-500 px-3 py-2 text-sm" role="note">
        <span aria-hidden>🔊 </span>
        Subí el volumen y dejá la <b>pantalla prendida con la app abierta</b> durante todo el test: con la pantalla apagada el navegador corta el sonido. Si
        la app se cierra, se puede retomar dentro de los {RESUME_MS / 1000} s.
      </p>
      <button type="button" className="btn-primary h-14 w-full text-lg" disabled={selected.size === 0} onClick={start}>
        Empezar ({p.lead_in_s} s de entrada)
      </button>
    </div>
  );
}

function ResumeCard({ snap, params, onResume, onFinish, onDiscard }: { snap: Snapshot; params: IftParams; onResume: () => void; onFinish: (r: Result[]) => void; onDiscard: () => void }) {
  const age = Date.now() - snap.heartbeat;
  const canResume = age <= RESUME_MS;
  const finish = () => {
    const st = snap.marks.reduce((s, m) => markRun(s, m, params), initRun(snap.playerIds));
    const end = snap.heartbeat - snap.epochStart;
    const fin = finalStages(st, end, params);
    onFinish(
      snap.playerIds.map((id) => ({
        playerId: id,
        lastStage: fin[id].lastStage,
        reason: fin[id].reason,
        interrupted: st.players[id].status === "running",
        misses: st.players[id].misses,
      })),
    );
  };
  return (
    <section className="card space-y-2 border-l-4 border-l-amber-500" role="alert">
      <p className="font-bold">
        <span aria-hidden>⚠ </span>Hay una corrida sin terminar (hace {Math.round(age / 1000)} s).
      </p>
      {canResume ? (
        <button type="button" className="btn-primary h-11" onClick={onResume}>
          Retomar
        </button>
      ) : (
        <p className="text-sm">Pasó demasiado tiempo para retomarla: se puede terminar en el último momento registrado. Los que seguían corriendo quedan como «interrumpido» para revisar.</p>
      )}
      <div className="flex gap-2">
        <button type="button" className="btn-dark h-11" onClick={finish}>
          Terminar ahí
        </button>
        <button type="button" className="btn-ghost h-11" onClick={onDiscard}>
          Descartar
        </button>
      </div>
    </section>
  );
}

function Runner({ ctx, params: p, snap, startMs, onEnd }: { ctx: FieldTestCtx<"ift_30_15">; params: IftParams; snap: Snapshot; startMs: number; onEnd: (r: Result[]) => void }) {
  const schedule = useMemo(() => buildSchedule(p), [p]);
  const beeper = useRef<Beeper | null>(null);
  const [now, setNow] = useState(startMs);
  const [run, setRun] = useState<IftRunState>(() => snap.marks.reduce((s, m) => markRun(s, m, p), initRun(snap.playerIds)));
  const [skipped, setSkipped] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const runRef = useRef(run);
  runRef.current = run;
  const players = useMemo(() => new Map(ctx.roster.map((r) => [r.id, r])), [ctx.roster]);
  const lastEvent = schedule[schedule.length - 1];

  const finish = useCallback(
    (atMs: number) => {
      void beeper.current?.close();
      beeper.current = null;
      const st = runRef.current;
      const fin = finalStages(st, atMs, p);
      onEnd(
        snap.playerIds.map((id) => ({
          playerId: id,
          lastStage: fin[id].lastStage,
          reason: fin[id].reason,
          interrupted: false,
          misses: st.players[id].misses,
        })),
      );
    },
    [onEnd, p, snap.playerIds],
  );

  // Audio + reloj + pantalla encendida
  useEffect(() => {
    const b = new Beeper();
    beeper.current = b;
    void b.start(schedule, startMs, p.late_skip_ms);
    let lock: WakeLockSentinel | null = null;
    const askLock = async () => {
      try {
        lock = (await navigator.wakeLock?.request("screen")) ?? null;
      } catch {
        /* no disponible */
      }
    };
    void askLock();
    const onVis = () => {
      if (document.visibilityState === "visible") void askLock();
    };
    document.addEventListener("visibilitychange", onVis);
    const ui = setInterval(() => {
      const t = b.now();
      setNow(t);
      setSkipped(b.skipped);
      const s = readSnap();
      if (s) writeSnap({ ...s, heartbeat: Date.now() });
    }, 100);
    return () => {
      clearInterval(ui);
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release().catch(() => undefined);
      void b.close();
    };
  }, [schedule, startMs, p.late_skip_ms]);

  // Fin del test por cronograma
  useEffect(() => {
    if (now >= lastEvent.t + 500) finish(now);
  }, [now, lastEvent.t, finish]);

  const apply = (m: IftMark) => {
    const next = markRun(run, m, p);
    setRun(next);
    const s = readSnap();
    if (s) writeSnap({ ...s, marks: next.marks, heartbeat: Date.now() });
  };
  const undo = () => {
    const next = undoRun(run, p);
    setRun(next);
    const s = readSnap();
    if (s) writeSnap({ ...s, marks: next.marks, heartbeat: Date.now() });
  };

  const ph = phaseAt(now, p);
  const stage = ph.kind === "leadin" ? 1 : ph.stage;
  const secsLeft = ph.kind === "leadin" ? Math.ceil(-now / 1000) : ph.kind === "run" ? Math.ceil((p.run_s * 1000 - ph.inMs) / 1000) : Math.ceil((p.rest_s * 1000 - ph.inMs) / 1000);
  const running = snap.playerIds.filter((id) => run.players[id]?.status === "running");
  const out = snap.playerIds.filter((id) => run.players[id]?.status === "out");

  return (
    <div className="space-y-3">
      <section className={`card sticky top-16 z-20 py-2 text-center shadow-lg ${ph.kind === "run" ? "border-2 border-orc-orange" : ""}`} aria-live="polite">
        <p className="text-sm font-semibold uppercase tracking-wide text-orc-muted">
          {ph.kind === "leadin" ? "Entrada" : ph.kind === "run" ? "▶ Carrera" : "⏸ Pausa"} · Etapa {stage}
        </p>
        <p className="text-5xl font-black tabular-nums">{secsLeft}</p>
        <p className="text-sm">
          {formatValue(stageSpeedKmh(ph.kind === "rest" ? stage + 1 : stage, p), 1)} km/h {ph.kind === "rest" ? "en la próxima" : ""}
        </p>
        {skipped > 0 && (
          <p className="mt-1 text-sm text-red-700 dark:text-red-400" role="alert">
            <span aria-hidden>⚠ </span>
            {skipped} {skipped === 1 ? "señal se salteó" : "señales se saltearon"} (llegaron tarde: ¿se apagó la pantalla?)
          </p>
        )}
      </section>

      {msg && <p className="text-sm" role="status">{msg}</p>}

      <ul className="space-y-1" aria-label="Corriendo">
        {running.map((id) => {
          const pl = players.get(id);
          const st = run.players[id];
          return (
            <li key={id} className="card flex items-center justify-between gap-2 py-2">
              <span className="text-sm font-semibold">
                {pl ? playerName(pl) : id}
                {st.misses.length > 0 && <span className="ml-1 chip tone-amber text-xs">⚠ {st.misses.length} sin llegar</span>}
              </span>
              <span className="flex shrink-0 gap-1">
                <button
                  type="button"
                  className="btn-dark h-11"
                  onClick={() => {
                    const line = lastLineBefore(schedule, now);
                    if (!line) return setMsg("Todavía no sonó ninguna línea.");
                    setMsg(null);
                    apply({ type: "miss", playerId: id, lineIndex: line.lineIndex!, stage: line.stage });
                  }}
                >
                  No llegó
                </button>
                <button type="button" className="btn-ghost h-11" onClick={() => apply({ type: "finish", playerId: id, t: now })}>
                  Terminó
                </button>
              </span>
            </li>
          );
        })}
      </ul>

      {out.length > 0 && (
        <section className="card text-sm" aria-label="Afuera">
          <h3 className="font-bold">Afuera ({out.length})</h3>
          <ul>
            {out.map((id) => (
              <li key={id}>
                {players.get(id) ? playerName(players.get(id)!) : id}: etapa {run.players[id].lastStage}
                {run.players[id].reason === "misses" ? ` (${p.max_misses} sin llegar seguidas)` : " (terminó)"}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-ghost h-11" disabled={run.marks.length === 0} onClick={undo}>
          ↶ Deshacer última marca
        </button>
        <button type="button" className={`${allOut(run) ? "btn-primary" : "btn-dark"} h-11`} onClick={() => finish(now)}>
          {allOut(run) ? "Quedaron todos afuera: terminar el test" : "Terminar el test"}
        </button>
      </div>
    </div>
  );
}

function Review({ ctx, results, onDone }: { ctx: FieldTestCtx<"ift_30_15">; results: Result[]; onDone: () => void }) {
  const players = new Map(ctx.roster.map((r) => [r.id, r]));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      for (const r of results) {
        const pl = players.get(r.playerId);
        if (!pl) continue;
        await ctx.save(pl, "app", { lastStage: r.lastStage, reason: r.reason, misses: r.misses, ...(r.interrupted ? { interrupted: true } : {}) }, {
          notes: r.interrupted ? "Corrida interrumpida: revisar la etapa." : null,
        });
      }
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="card space-y-3">
      <h2 className="text-lg font-bold">Resultados</h2>
      <ul className="divide-y divide-orc-line">
        {results.map((r) => {
          const v = vift(r.lastStage, ctx.params);
          const pl = players.get(r.playerId);
          return (
            <li key={r.playerId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span className="font-semibold">{pl ? playerName(pl) : r.playerId}</span>
              <span className="tabular-nums">
                Etapa {r.lastStage} · <b>{v === null ? "sin VIFT" : `VIFT ${formatValue(v, 1)} km/h`}</b>
                {r.interrupted && <span className="ml-1 chip tone-amber text-xs">⚠ interrumpido</span>}
              </span>
            </li>
          );
        })}
      </ul>
      {err && (
        <p className="text-sm text-red-700 dark:text-red-400" role="alert">
          ⛔ {err}
        </p>
      )}
      <button type="button" className="btn-primary h-12 w-full" disabled={saving} onClick={() => void save()}>
        {saving ? "Guardando…" : `Guardar ${results.length} resultados`}
      </button>
      <button type="button" className="btn-ghost h-11 w-full" onClick={onDone}>
        Descartar
      </button>
    </section>
  );
}
