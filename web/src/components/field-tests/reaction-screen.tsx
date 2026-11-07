"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { currentDeviceId, deviceLabel, ensureDevice } from "@/lib/field-tests/client";
import {
  newSeries,
  nextStimulus,
  recordTrial,
  seriesResult,
  seriesStatus,
  validCount,
  type ReactionMode,
  type SeriesState,
  type StimulusKind,
} from "@/lib/field-tests/reaction";
import type { ReactionParams } from "@/lib/field-tests/protocol";
import type { RosterPlayer } from "@/lib/types";
import { FieldTestFrame } from "./test-frame";
import { PlayerPicker, Segmented, playerName } from "./parts";
import type { FieldTestCtx } from "./use-field-test";

export function ReactionScreen() {
  return <FieldTestFrame code="reaction" title="Test de reacción">{(ctx) => <ReactionBody ctx={ctx} />}</FieldTestFrame>;
}

function ReactionBody({ ctx }: { ctx: FieldTestCtx<"reaction"> }) {
  const [player, setPlayer] = useState<RosterPlayer | null>(null);
  const [mode, setMode] = useState<ReactionMode>("simple");
  const [device, setDevice] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => {
    void ensureDevice().then(setDevice);
  }, []);

  if (player && device) {
    return (
      <Series
        key={`${player.id}:${mode}`}
        ctx={ctx}
        player={player}
        mode={mode}
        deviceId={device}
        onDone={(msg) => {
          setSaved(msg);
          setPlayer(null); // el celular pasa de mano en mano: se olvida del jugador
        }}
      />
    );
  }
  return (
    <div className="space-y-3">
      <p className="rounded-lg border border-sky-600 px-3 py-2 text-sm" role="note">
        <span aria-hidden>ℹ </span>
        La latencia de la pantalla cambia entre celulares (30–80 ms). Por eso sólo se compara al <b>mismo jugador con el mismo celular</b>: no hay rankings
        ni promedios del grupo. Este celular es el equipo «{device ? deviceLabel() : "…"}» ({(currentDeviceId() ?? "").slice(0, 8)}).
      </p>
      {saved && (
        <p className="chip tone-green" role="status">
          <span aria-hidden>✓</span> {saved}
        </p>
      )}
      <Segmented<ReactionMode>
        label="Tipo"
        value={mode}
        onChange={setMode}
        options={[
          { value: "simple", label: "Simple" },
          { value: "gonogo", label: "Go / no-go" },
        ]}
      />
      <p className="text-sm text-orc-muted">
        {ctx.params.practice} estímulos de práctica y {ctx.params.valid} válidos. {mode === "gonogo" ? "Círculo «Tocá»: tocar; cuadrado «No toques»: no tocar." : "Tocá apenas aparece el círculo."}{" "}
        Elegí al jugador (sólo se muestra el suyo):
      </p>
      <PlayerPicker ctx={ctx} onSelect={(p) => (setSaved(null), setPlayer(p))} />
    </div>
  );
}

type Stage = "intro" | "wait" | "stim" | "feedback" | "end";

function Series({ ctx, player, mode, deviceId, onDone }: { ctx: FieldTestCtx<"reaction">; player: RosterPlayer; mode: ReactionMode; deviceId: string; onDone: (msg: string) => void }) {
  const p: ReactionParams = ctx.params;
  const [series, setSeries] = useState<SeriesState>(() => newSeries(mode));
  const [stage, setStage] = useState<Stage>("intro");
  const [stim, setStim] = useState<{ kind: StimulusKind; practice: boolean; waitMs: number } | null>(null);
  const [feedback, setFeedback] = useState<string>("");
  const [restarted, setRestarted] = useState(false);
  const shownAt = useRef<number | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const rnd = useRef(Math.random);
  const seriesRef = useRef(series);
  seriesRef.current = series;

  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clear, []);

  const finishTrial = useCallback(
    (tapMs: number | null) => {
      clear();
      const cur = stim;
      if (!cur) return;
      const next = recordTrial(seriesRef.current, cur, tapMs, p);
      setSeries(next);
      shownAt.current = null;
      const last = next.trials[next.trials.length - 1];
      setFeedback(
        last.outcome === "valid"
          ? `${last.rtMs} ms`
          : last.outcome === "anticipation"
            ? "¡Antes de tiempo! Esperá el estímulo."
            : last.outcome === "lapse"
              ? "No tocaste."
              : last.outcome === "commission"
                ? "Era «No toques»."
                : "Bien, no tocaste.",
      );
      setStage("feedback");
      timers.current.push(
        setTimeout(() => {
          if (seriesStatus(next, p) !== "running") setStage("end");
          else begin(next);
        }, 700),
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stim, p],
  );

  const begin = (s: SeriesState) => {
    clear();
    const st = nextStimulus(s, p, rnd.current);
    setStim(st);
    setStage("wait");
    timers.current.push(setTimeout(() => setStage("stim"), st.waitMs));
  };

  // El tiempo corre desde el primer cuadro con el estímulo dibujado.
  useLayoutEffect(() => {
    if (stage !== "stim") return;
    const id = requestAnimationFrame(() => {
      shownAt.current = performance.now();
      timers.current.push(setTimeout(() => finishTrial(null), p.window_ms));
    });
    return () => cancelAnimationFrame(id);
  }, [stage, finishTrial, p.window_ms]);

  // Si la app sale de primer plano, la serie empieza de nuevo.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden" && stage !== "intro" && stage !== "end") {
        clear();
        setSeries(newSeries(mode));
        setStim(null);
        setStage("intro");
        setRestarted(true);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [stage, mode]);

  const onPress = (e: React.PointerEvent) => {
    if (stage === "wait" && stim) {
      // Toque durante la espera = anticipación
      finishTrial(-1);
      return;
    }
    if (stage === "stim" && shownAt.current !== null) finishTrial(e.timeStamp - shownAt.current);
  };

  const status = seriesStatus(series, p);
  const result = seriesResult(series);
  const practiceLeft = series.trials.filter((t) => t.practice && t.outcome !== "anticipation" && t.outcome !== "lapse").length;

  if (stage === "intro") {
    return (
      <section className="card space-y-3 text-center">
        <h2 className="text-xl font-bold">{playerName(player)}</h2>
        {restarted && (
          <p className="text-sm" role="alert">
            <span aria-hidden>⚠ </span>La app salió de la pantalla: la serie empieza de nuevo.
          </p>
        )}
        <p className="text-sm">
          {mode === "gonogo" ? (
            <>
              Tocá la pantalla apenas aparezca el <b>círculo «Tocá»</b>. Si aparece el <b>cuadrado «No toques»</b>, no toques.
            </>
          ) : (
            <>
              Tocá la pantalla apenas aparezca el <b>círculo «Tocá»</b>.
            </>
          )}{" "}
          Primero hay {p.practice} de práctica.
        </p>
        <button type="button" className="btn-primary h-14 w-full text-lg" onClick={() => begin(series)}>
          Empezar
        </button>
        <button type="button" className="btn-ghost h-11 w-full" onClick={() => onDone("Serie cancelada.")}>
          Cancelar
        </button>
      </section>
    );
  }

  if (stage === "end") {
    const ok = status === "complete";
    return (
      <section className="card space-y-3 text-center">
        <h2 className="text-xl font-bold">{playerName(player)}</h2>
        {ok ? (
          <>
            <p className="text-5xl font-black tabular-nums">{result.meanMs} ms</p>
            <p className="text-sm">
              Promedio de {validCount(series)} válidos ({mode === "gonogo" ? "go/no-go" : "simple"}). {result.notes}
            </p>
            <button
              type="button"
              className="btn-primary h-12 w-full"
              onClick={() =>
                void ctx
                  .save(player, "app", { mode, trials: series.trials.map(({ kind, practice, outcome, rtMs, waitMs }) => ({ kind, practice, outcome, rtMs, waitMs })) }, { deviceId, notes: result.notes })
                  .then(() => onDone(`Guardado: ${player.first_name}, ${result.meanMs} ms.`))
              }
            >
              Guardar
            </button>
          </>
        ) : (
          <p className="text-sm" role="alert">
            <span aria-hidden>⛔ </span>Serie incompleta (se llegó al tope de {p.max_scored} estímulos): no se guarda.
          </p>
        )}
        <button type="button" className="btn-ghost h-11 w-full" onClick={() => onDone(ok ? "Serie descartada." : "Serie incompleta.")}>
          {ok ? "Descartar" : "Volver"}
        </button>
      </section>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex touch-none select-none flex-col items-center justify-center bg-orc-black text-white"
      onPointerDown={onPress}
      role="button"
      aria-label="Zona de toque"
      tabIndex={0}
    >
      <p className="absolute top-6 text-sm text-white/70">
        {stim?.practice ? `Práctica ${Math.min(practiceLeft + 1, p.practice)} de ${p.practice}` : `Válidos ${validCount(series)} de ${p.valid}`}
      </p>
      {stage === "stim" && stim?.kind === "go" && (
        <div className="flex size-56 items-center justify-center rounded-full bg-green-500 text-3xl font-black text-orc-black">Tocá</div>
      )}
      {stage === "stim" && stim?.kind === "nogo" && (
        <div className="flex size-56 items-center justify-center bg-red-600 text-2xl font-black">No toques</div>
      )}
      {stage === "wait" && <p className="text-xl text-white/60">Esperá…</p>}
      {stage === "feedback" && <p className="text-3xl font-bold">{feedback}</p>}
    </div>
  );
}
