"use client";

// Marcado cuadro a cuadro de un video en cámara lenta importado de la
// galería. El archivo NO se sube ni se copia: se lee en el celular y se
// suelta al salir de la pantalla.

import { useCallback, useEffect, useRef, useState } from "react";
import { blobReader, readMp4Info, Mp4Error } from "@/lib/field-tests/mp4";
import { analyzeTiming, mediaTimeForFrame, type VideoTiming } from "@/lib/field-tests/video-timing";

export interface MarkSpec {
  key: string;
  label: string;
  optional?: boolean;
}

export interface LoadedVideo {
  fileName: string;
  timing: VideoTiming;
  pts: number[];
}

const MAX_BYTES = 1024 * 1024 * 1024; // 1 GiB

export function VideoMarker({
  marks,
  steps,
  minFps,
  sequential = false,
  value,
  onChange,
  onVideo,
}: {
  marks: MarkSpec[];
  steps: number[];
  minFps: number;
  sequential?: boolean;
  value: Record<string, number | null>;
  onChange: (v: Record<string, number | null>) => void;
  onVideo: (v: LoadedVideo | null) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [video, setVideo] = useState<LoadedVideo | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [frame, setFrame] = useState(0);
  const [active, setActive] = useState(marks[0].key);
  const ref = useRef<HTMLVideoElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Suelta el archivo al salir
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  const reset = useCallback(() => {
    setVideo(null);
    onVideo(null);
    setUrl((u) => {
      if (u) URL.revokeObjectURL(u);
      return null;
    });
    if (inputRef.current) inputRef.current.value = "";
  }, [onVideo]);

  async function pick(file: File | undefined) {
    reset();
    setProblem(null);
    if (!file) return;
    if (!/\.(mp4|mov|m4v)$/i.test(file.name) && !/video\/(mp4|quicktime)/.test(file.type)) {
      setProblem("El archivo tiene que ser un video MP4 o MOV.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setProblem("El video es demasiado grande. Recortalo al salto o la pasada antes de importarlo.");
      return;
    }
    setReading(true);
    try {
      const info = await readMp4Info(blobReader(file), file.size);
      const timing = analyzeTiming(info.ptsSec, info.captureFps, minFps);
      if (!timing.ok) {
        setProblem(timing.message ?? "El video no sirve para medir.");
        if (inputRef.current) inputRef.current.value = "";
        return;
      }
      const v = { fileName: file.name, timing, pts: info.ptsSec };
      setVideo(v);
      onVideo(v);
      setUrl(URL.createObjectURL(file));
      setFrame(0);
      setActive(marks[0].key);
    } catch (e) {
      setProblem(e instanceof Mp4Error ? e.message : "No se pudo leer el video.");
      if (inputRef.current) inputRef.current.value = "";
    } finally {
      setReading(false);
    }
  }

  const last = video ? video.timing.frameCount - 1 : 0;
  const go = useCallback(
    (n: number) => {
      if (!video) return;
      const f = Math.max(0, Math.min(last, Math.round(n)));
      setFrame(f);
      const el = ref.current;
      if (el) el.currentTime = mediaTimeForFrame(f, video.pts, video.timing.medianInterval);
    },
    [video, last],
  );

  const mark = (key: string) => {
    const next = { ...value, [key]: frame };
    onChange(next);
    if (sequential) {
      const i = marks.findIndex((m) => m.key === key);
      const following = marks.slice(i + 1).find((m) => next[m.key] == null);
      if (following) setActive(following.key);
    }
  };

  return (
    <div className="space-y-3">
      {!video && (
        <div className="space-y-2">
          <label className="btn-dark flex h-12 cursor-pointer items-center justify-center">
            {reading ? "Leyendo el video…" : "Elegir video en cámara lenta"}
            <input ref={inputRef} type="file" accept="video/mp4,video/quicktime,.mp4,.mov" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
          </label>
          <p className="text-xs text-orc-muted">
            Filmá con la cámara lenta del celular (ideal 240 cuadros por segundo, mínimo {minFps}) y elegilo de la galería. El video no se sube: se
            mide en este celular.
          </p>
        </div>
      )}
      {problem && (
        <p className="rounded-lg border border-red-600 px-3 py-2 text-sm" role="alert">
          <span aria-hidden>⛔ </span>
          {problem}
        </p>
      )}
      {video && url && (
        <>
          <div className="overflow-hidden rounded-xl bg-black">
            <video
              ref={ref}
              src={url}
              muted
              playsInline
              preload="auto"
              className="mx-auto max-h-[55vh] w-full object-contain"
              onLoadedMetadata={() => go(0)}
              aria-label="Video para marcar"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="tabular-nums">
              Cuadro <b>{frame}</b> de {last} · {video.timing.fps} fps
              {video.timing.timelineScale > 1.01 && <span className="text-orc-muted"> (cámara lenta ×{Math.round(video.timing.timelineScale)})</span>}
            </span>
            <button type="button" className="text-xs font-semibold underline" onClick={reset}>
              Cambiar video
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1 sm:flex sm:flex-wrap" role="group" aria-label="Moverse por cuadros">
            {[...steps].reverse().map((s) => (
              <button key={`-${s}`} type="button" className="btn-ghost h-11 tabular-nums" onClick={() => go(frame - s)} aria-label={`Retroceder ${s} cuadros`}>
                −{s}
              </button>
            ))}
            {steps.map((s) => (
              <button key={`+${s}`} type="button" className="btn-ghost h-11 tabular-nums" onClick={() => go(frame + s)} aria-label={`Avanzar ${s} cuadros`}>
                +{s}
              </button>
            ))}
          </div>
          <input
            type="range"
            min={0}
            max={last}
            value={frame}
            onChange={(e) => go(Number(e.target.value))}
            className="w-full accent-orc-orange"
            aria-label="Ir a un cuadro"
          />
          <ul className="space-y-1">
            {marks.map((m) => {
              const at = value[m.key];
              const isActive = sequential ? active === m.key : true;
              return (
                <li key={m.key} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-1 ${sequential && isActive ? "bg-orc-chip" : ""}`}>
                  <span className="text-sm">
                    <b>{m.label}</b>
                    {m.optional && <span className="text-orc-muted"> (opcional)</span>}:{" "}
                    {at == null ? <span className="text-orc-muted">sin marcar</span> : <span className="tabular-nums">cuadro {at}</span>}
                  </span>
                  <span className="flex gap-1">
                    <button type="button" className="btn-primary h-10" onClick={() => mark(m.key)} disabled={sequential && !isActive && at == null}>
                      {at == null ? `Marcar ${m.label.toLowerCase()}` : "Remarcar acá"}
                    </button>
                    {at != null && (
                      <>
                        <button type="button" className="btn-ghost h-10" onClick={() => go(at)}>
                          Ir
                        </button>
                        <button
                          type="button"
                          className="btn-ghost h-10"
                          onClick={() => {
                            onChange({ ...value, [m.key]: null });
                            setActive(m.key);
                          }}
                          aria-label={`Borrar marca ${m.label}`}
                        >
                          Borrar
                        </button>
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

/** Explica por qué no se puede filmar (sin consentimiento de imagen). */
export function NoImageConsent({ name }: { name: string }) {
  return (
    <p className="rounded-lg border border-amber-500 px-3 py-2 text-sm" role="note">
      <span aria-hidden>🚫 </span>
      {name} no tiene el consentimiento de <b>uso de imagen</b> firmado: no se lo puede filmar, ni siquiera en el celular. Cargá el dato a mano o
      pedile al admin que registre el consentimiento.
    </p>
  );
}
