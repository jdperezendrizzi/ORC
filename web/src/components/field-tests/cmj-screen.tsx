"use client";

import { useMemo, useState } from "react";
import { cmjLive } from "@/lib/field-tests/cmj";
import { parseDecimal, type MeasureMethod } from "@/lib/field-tests/protocol";
import type { RosterPlayer } from "@/lib/types";
import { formatValue } from "@/lib/validation";
import { FieldTestFrame } from "./test-frame";
import { AttemptsList, LivePreview, PlayerPicker, SaveButton, Segmented, playerName } from "./parts";
import type { FieldTestCtx } from "./use-field-test";
import { NoImageConsent, VideoMarker, type LoadedVideo } from "./video-marker";

type Mode = "height" | "flight" | "video";

export function CmjScreen() {
  return <FieldTestFrame code="cmj" title="CMJ (salto con contramovimiento)">{(ctx) => <CmjBody ctx={ctx} />}</FieldTestFrame>;
}

function CmjBody({ ctx }: { ctx: FieldTestCtx<"cmj"> }) {
  const [player, setPlayer] = useState<RosterPlayer | null>(null);
  if (!player) {
    return (
      <>
        <p className="text-sm text-orc-muted">Manos en la cintura, {ctx.params.attempts} intentos, vale el mejor. Elegí al jugador:</p>
        <PlayerPicker ctx={ctx} onSelect={setPlayer} />
      </>
    );
  }
  return <CmjPlayer key={player.id} ctx={ctx} player={player} onBack={() => setPlayer(null)} />;
}

export function CmjPlayer({ ctx, player, onBack, footer }: { ctx: FieldTestCtx<"cmj">; player: RosterPlayer; onBack: () => void; footer?: React.ReactNode }) {
  const canFilm = ctx.hasConsent(player.id, "image_use");
  const [mode, setMode] = useState<Mode>("height");
  const [raw, setRaw] = useState("");
  const [conditions, setConditions] = useState("");
  const [marks, setMarks] = useState<Record<string, number | null>>({ takeoff: null, landing: null });
  const [video, setVideo] = useState<LoadedVideo | null>(null);
  const p = ctx.params;

  const done = ctx.attempts.filter((a) => a.player_id === player.id && !ctx.voids.has(a.id)).length;

  const { method, inputs } = useMemo((): { method: MeasureMethod; inputs: Record<string, unknown> | null } => {
    if (mode === "video") {
      if (!video || marks.takeoff == null || marks.landing == null) return { method: "video", inputs: null };
      return { method: "video", inputs: { takeoffFrame: marks.takeoff, landingFrame: marks.landing, frameRateFps: video.timing.fps } };
    }
    const n = parseDecimal(raw);
    if (n === null) return { method: mode === "height" ? "app" : "manual", inputs: null };
    return mode === "height" ? { method: "app", inputs: { heightCm: n } } : { method: "manual", inputs: { flightMs: n } };
  }, [mode, raw, marks, video]);

  const check = inputs ? ctx.check(player, method, inputs) : raw.trim() && mode !== "video" ? { values: [], error: "Escribí un número mayor que cero (con coma decimal).", warnings: [] } : null;
  const live = mode === "video" && video ? cmjLive({ takeoff: marks.takeoff, landing: marks.landing, fps: video.timing.fps, g: p.g }) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-bold">{playerName(player)}</h2>
        <button type="button" className="btn-ghost h-10 shrink-0 whitespace-nowrap" onClick={onBack}>
          Cambiar jugador
        </button>
      </div>
      <section className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold">
            Intento {done + 1}
            <span className="text-orc-muted"> de {p.attempts}</span>
          </p>
          <Segmented<Mode>
            label="Cómo se mide"
            value={mode}
            onChange={(m) => {
              setMode(m);
              setRaw("");
            }}
            options={[
              { value: "height", label: "Altura (cm)" },
              { value: "flight", label: "Tiempo de vuelo" },
              { value: "video", label: "Video" },
            ]}
          />
        </div>

        {mode === "height" && (
          <label className="flex flex-col text-sm">
            <span className="label">Altura en cm (de una app de salto)</span>
            <input className="field-input h-12 text-lg" inputMode="decimal" placeholder="Ej.: 38,4" value={raw} onChange={(e) => setRaw(e.target.value)} autoFocus />
          </label>
        )}
        {mode === "flight" && (
          <label className="flex flex-col text-sm">
            <span className="label">Tiempo de vuelo en milisegundos (plataforma de contacto)</span>
            <input className="field-input h-12 text-lg" inputMode="decimal" placeholder="Ej.: 560" value={raw} onChange={(e) => setRaw(e.target.value)} autoFocus />
            <span className="mt-1 text-xs text-orc-muted">La altura la calcula la app: h = g·t²/8.</span>
          </label>
        )}
        {mode === "video" &&
          (canFilm ? (
            <>
              <p className="text-xs text-orc-muted">Celular fijo a 1,5 m, cámara trasera en cámara lenta. Marcá el último cuadro con los pies en el piso (despegue) y el primero que vuelve a tocar (aterrizaje).</p>
              <VideoMarker
                marks={[
                  { key: "takeoff", label: "Despegue" },
                  { key: "landing", label: "Aterrizaje" },
                ]}
                steps={[1, 10]}
                minFps={p.min_fps}
                value={marks}
                onChange={setMarks}
                onVideo={setVideo}
              />
              {live && (
                <p className="text-sm" aria-live="polite">
                  Vuelo <b className="tabular-nums">{formatValue(live.flightMs, 0)} ms</b> · Altura <b className="tabular-nums">{formatValue(live.heightCm, 1)} cm</b> ·
                  precisión <b className="tabular-nums">±{formatValue(live.precisionCm, 1)} cm</b> (si una marca se corre un cuadro)
                </p>
              )}
            </>
          ) : (
            <NoImageConsent name={player.first_name} />
          ))}

        <label className="flex flex-col text-sm">
          <span className="label">Condiciones (opcional)</span>
          <input className="field-input h-10" placeholder="Ej.: césped, con botines" value={conditions} onChange={(e) => setConditions(e.target.value)} />
        </label>

        <LivePreview check={check} />
        <SaveButton
          check={check}
          disabled={!inputs}
          onSave={async () => {
            await ctx.save(player, method, inputs!, { conditions });
            setRaw("");
            setMarks({ takeoff: null, landing: null });
          }}
        />
      </section>
      {footer}
      <section className="card">
        <h3 className="mb-1 font-bold">Intentos de hoy</h3>
        <AttemptsList ctx={ctx} player={player} />
      </section>
    </div>
  );
}
