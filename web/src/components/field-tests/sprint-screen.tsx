"use client";

import { useMemo, useState } from "react";
import { parseDecimal, type MeasureMethod } from "@/lib/field-tests/protocol";
import { sprintFramesError, sprintSetup, sprintTimes, timePrecisionS, vmaxPrecision } from "@/lib/field-tests/sprint";
import type { RosterPlayer } from "@/lib/types";
import { formatValue } from "@/lib/validation";
import { Collapsible } from "../collapsible";
import { FieldTestFrame } from "./test-frame";
import { AttemptsList, LivePreview, PlayerPicker, SaveButton, Segmented, playerName } from "./parts";
import type { FieldTestCtx } from "./use-field-test";
import { NoImageConsent, VideoMarker, type LoadedVideo } from "./video-marker";

type Mode = "video" | "fotocelula" | "manual";

export function SprintScreen() {
  return <FieldTestFrame code="sprint_40" title="Sprint 10/20/40 m">{(ctx) => <SprintBody ctx={ctx} />}</FieldTestFrame>;
}

function SprintBody({ ctx }: { ctx: FieldTestCtx<"sprint_40"> }) {
  const [player, setPlayer] = useState<RosterPlayer | null>(null);
  return (
    <>
      <SetupCard ctx={ctx} />
      {player ? (
        <SprintPlayer key={player.id} ctx={ctx} player={player} onBack={() => setPlayer(null)} />
      ) : (
        <>
          <p className="text-sm text-orc-muted">
            Salida parado, {formatValue(ctx.params.start_behind_m, 1)} m detrás de la línea. {ctx.params.attempts} intentos con {ctx.params.rest_min} min de
            pausa, vale el mejor. Elegí al jugador:
          </p>
          <PlayerPicker ctx={ctx} onSelect={setPlayer} />
        </>
      )}
    </>
  );
}

/** Armado del celular y de los conos (corregidos por paralaje). */
function SetupCard({ ctx }: { ctx: FieldTestCtx<"sprint_40"> }) {
  const p = ctx.params;
  const [d, setD] = useState(String(p.suggested_distance_m));
  const [off, setOff] = useState(String(p.cone_offset_m));
  const [fov, setFov] = useState(String(p.camera_fov_deg));
  const D = parseDecimal(d);
  const P = parseDecimal(off);
  const F = parseDecimal(fov);
  const setup = D && D > 0 && P !== null && F ? sprintSetup(D, P, F, p.max_line_angle_deg) : null;
  return (
    <Collapsible summary={<span className="font-bold">Armado (celular y conos)</span>} className="card">
      <div className="space-y-3 text-sm">
        <p>
          Trípode con el celular <b>apaisado y quieto</b>, frente a la línea de <b>20 m</b>, a una distancia D del carril. Cámara lenta (ideal 240 fps).
          Los conos van a P m <b>detrás</b> del carril, del lado de enfrente, para que nadie los pise: «alineado con su cono» = «cruzó la línea».
        </p>
        <div className="grid grid-cols-3 gap-2">
          <label className="flex flex-col">
            <span className="label">D (m)</span>
            <input className="field-input h-10" inputMode="decimal" value={d} onChange={(e) => setD(e.target.value)} />
          </label>
          <label className="flex flex-col">
            <span className="label">P (m)</span>
            <input className="field-input h-10" inputMode="decimal" value={off} onChange={(e) => setOff(e.target.value)} />
          </label>
          <label className="flex flex-col">
            <span className="label">Cámara (°)</span>
            <input className="field-input h-10" inputMode="decimal" value={fov} onChange={(e) => setFov(e.target.value)} />
          </label>
        </div>
        {setup && (
          <>
            <table className="w-full text-left">
              <thead className="text-xs text-orc-muted">
                <tr>
                  <th className="py-1">Línea</th>
                  <th className="py-1">Cono en</th>
                  <th className="py-1">Ángulo</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {setup.cones.map((c) => (
                  <tr key={c.line}>
                    <td className="py-1">{c.line} m</td>
                    <td className="py-1">
                      <b>{formatValue(c.at, 2)} m</b>
                    </td>
                    <td className="py-1">{Math.round(c.angle)}°</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-orc-muted">
              Hace falta ver {Math.round(setup.fovNeeded)}° (la cámara normal ve unos 60° en cámara lenta; más cerca de 35 m usá el gran angular).
            </p>
            {setup.warnings.map((w) => (
              <p key={w} className="rounded-lg border border-amber-500 px-3 py-2" role="note">
                <span aria-hidden>⚠ </span>
                {w}
              </p>
            ))}
            {setup.warnings.length === 0 && (
              <p className="chip tone-green">
                <span aria-hidden>✓</span> El armado entra en la imagen.
              </p>
            )}
            <p>
              <b>Control final:</b> mirá la pantalla del celular y comprobá que se ven los 4 conos.
            </p>
          </>
        )}
      </div>
    </Collapsible>
  );
}

function SprintPlayer({ ctx, player, onBack }: { ctx: FieldTestCtx<"sprint_40">; player: RosterPlayer; onBack: () => void }) {
  const canFilm = ctx.hasConsent(player.id, "image_use");
  const [mode, setMode] = useState<Mode>(canFilm ? "video" : "fotocelula");
  const [marks, setMarks] = useState<Record<string, number | null>>({ start: null, m10: null, m20: null, m40: null });
  const [video, setVideo] = useState<LoadedVideo | null>(null);
  const [t, setT] = useState({ t10: "", t20: "", t40: "" });
  const [conditions, setConditions] = useState("");
  const done = ctx.attempts.filter((a) => a.player_id === player.id && !ctx.voids.has(a.id)).length;

  const { method, inputs, problem } = useMemo((): { method: MeasureMethod; inputs: Record<string, unknown> | null; problem: string | null } => {
    if (mode === "video") {
      if (!video) return { method: "video", inputs: null, problem: null };
      const f = { startFrame: marks.start, frame10: marks.m10, frame20: marks.m20, frame40: marks.m40 };
      if (f.startFrame == null || f.frame20 == null || f.frame40 == null) return { method: "video", inputs: null, problem: null };
      const err = sprintFramesError(f as never);
      if (err) return { method: "video", inputs: null, problem: err };
      return {
        method: "video",
        inputs: { startFrame: f.startFrame, ...(f.frame10 == null ? {} : { frame10: f.frame10 }), frame20: f.frame20, frame40: f.frame40, frameRateFps: video.timing.fps },
        problem: null,
      };
    }
    const t10 = t.t10.trim() ? parseDecimal(t.t10) : null;
    const t20 = parseDecimal(t.t20);
    const t40 = parseDecimal(t.t40);
    if ((t.t10.trim() && t10 === null) || (t.t20.trim() && t20 === null) || (t.t40.trim() && t40 === null)) {
      return { method: mode, inputs: null, problem: "Escribí los tiempos en segundos, con coma decimal (ej.: 3,05)." };
    }
    if (t20 === null || t40 === null) return { method: mode, inputs: null, problem: null };
    return { method: mode, inputs: { ...(t10 === null ? {} : { t10 }), t20, t40 }, problem: null };
  }, [mode, marks, video, t]);

  const check = inputs ? ctx.check(player, method, inputs) : problem ? { values: [], error: problem, warnings: [] } : null;
  const live =
    mode === "video" && video && inputs
      ? (() => {
          const r = sprintTimes(inputs as never, video.timing.fps);
          return { ...r, tp: timePrecisionS(video.timing.fps), vp: vmaxPrecision(r.t20, r.t40, video.timing.fps) };
        })()
      : null;

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
            <span className="text-orc-muted"> de {ctx.params.attempts}</span>
          </p>
          <Segmented<Mode>
            label="Cómo se mide"
            value={mode}
            onChange={setMode}
            options={[
              { value: "video", label: "Video" },
              { value: "fotocelula", label: "Fotocélula" },
              { value: "manual", label: "Cronómetro" },
            ]}
          />
        </div>
        {mode === "video" ? (
          canFilm ? (
            <>
              <p className="text-xs text-orc-muted">
                Marcá el cruce del <b>tronco</b> en cada línea (como la fotocélula). «Salida» = cruce de la línea de 0 m. Cada marca pasa sola a la siguiente.
              </p>
              <VideoMarker
                marks={[
                  { key: "start", label: "Salida" },
                  { key: "m10", label: "10 m", optional: true },
                  { key: "m20", label: "20 m" },
                  { key: "m40", label: "40 m" },
                ]}
                steps={[1, 10, 60]}
                minFps={ctx.params.min_fps}
                sequential
                value={marks}
                onChange={setMarks}
                onVideo={setVideo}
              />
              {live && (
                <p className="text-sm" aria-live="polite">
                  Cada tiempo ±{formatValue(live.tp * 1000, 1)} ms · Vmax {formatValue(live.vmax, 2)} m/s ±{formatValue(live.vp, 2)}
                </p>
              )}
            </>
          ) : (
            <NoImageConsent name={player.first_name} />
          )
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {(["t10", "t20", "t40"] as const).map((k) => (
              <label key={k} className="flex flex-col text-sm">
                <span className="label">
                  {k.slice(1)} m (s){k === "t10" && <span className="text-orc-muted"> · opc.</span>}
                </span>
                <input className="field-input h-12 text-lg" inputMode="decimal" placeholder={k === "t10" ? "1,85" : k === "t20" ? "3,10" : "5,40"} value={t[k]} onChange={(e) => setT({ ...t, [k]: e.target.value })} />
              </label>
            ))}
          </div>
        )}
        <label className="flex flex-col text-sm">
          <span className="label">Condiciones (opcional)</span>
          <input className="field-input h-10" placeholder="Ej.: césped seco, viento en contra" value={conditions} onChange={(e) => setConditions(e.target.value)} />
        </label>
        <LivePreview check={check} />
        <SaveButton
          check={check}
          disabled={!inputs}
          onSave={async () => {
            await ctx.save(player, method, inputs!, { conditions });
            setMarks({ start: null, m10: null, m20: null, m40: null });
            setT({ t10: "", t20: "", t40: "" });
          }}
        />
        {mode === "video" && <p className="text-xs text-orc-muted">El video no sale del celular: se guardan los cuadros, los fps y la versión del protocolo.</p>}
      </section>
      <section className="card">
        <h3 className="mb-1 font-bold">Intentos de hoy</h3>
        <AttemptsList ctx={ctx} player={player} />
      </section>
    </div>
  );
}
