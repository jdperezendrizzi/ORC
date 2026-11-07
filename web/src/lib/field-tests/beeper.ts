// Señales del 30-15 IFT sintetizadas en el celular (sin audio grabado: anda
// sin red y suena igual en todos los teléfonos). Cada sonido se distingue
// por tono y ritmo, nunca sólo por el volumen.
//
// Reloj: el del AudioContext (monotónico). Las señales se programan con
// anticipación sobre ese reloj, así no hay deriva; una señal que llega más
// de `lateSkipMs` tarde (ej. la pestaña estuvo congelada) se saltea.

import type { IftEvent, IftSignal } from "./ift";

interface ToneSpec {
  notes: { hz: number; ms: number }[];
  gapMs: number;
}

export const SOUNDS: Record<IftSignal, ToneSpec> = {
  countdown: { notes: [{ hz: 660, ms: 110 }], gapMs: 0 },
  start: { notes: [{ hz: 880, ms: 450 }], gapMs: 0 },
  line: { notes: [{ hz: 1175, ms: 160 }], gapMs: 0 },
  end_run: { notes: [{ hz: 587, ms: 160 }, { hz: 587, ms: 160 }], gapMs: 90 },
  end_test: { notes: [{ hz: 784, ms: 220 }, { hz: 659, ms: 220 }, { hz: 523, ms: 420 }], gapMs: 60 },
};

/** PCM mono: seno + tercer armónico, bordes suaves (sin clics). */
export function synthesize(spec: ToneSpec, sampleRate = 22050): Float32Array {
  const total = spec.notes.reduce((a, n) => a + n.ms, 0) + spec.gapMs * (spec.notes.length - 1);
  const out = new Float32Array(Math.ceil((total / 1000) * sampleRate));
  let offset = 0;
  const fade = Math.round(0.006 * sampleRate);
  for (const n of spec.notes) {
    const len = Math.round((n.ms / 1000) * sampleRate);
    for (let i = 0; i < len; i++) {
      const t = i / sampleRate;
      const env = Math.min(1, i / fade, (len - 1 - i) / fade);
      out[offset + i] = 0.8 * env * (Math.sin(2 * Math.PI * n.hz * t) * 0.75 + Math.sin(2 * Math.PI * 3 * n.hz * t) * 0.25);
    }
    offset += len + Math.round((spec.gapMs / 1000) * sampleRate);
  }
  return out;
}

export class Beeper {
  readonly ctx: AudioContext;
  private buffers = new Map<IftSignal, AudioBuffer>();
  private anchor = 0; // ctx.currentTime del inicio de la etapa 1
  private timer: ReturnType<typeof setInterval> | null = null;
  private idx = 0;
  skipped = 0;

  constructor() {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC({ latencyHint: "interactive" });
    // iOS 17+: que suene aunque el teléfono esté en silencio.
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession) nav.audioSession.type = "playback";
    for (const k of Object.keys(SOUNDS) as IftSignal[]) {
      const pcm = synthesize(SOUNDS[k], 22050);
      const buf = this.ctx.createBuffer(1, pcm.length, 22050);
      buf.copyToChannel(pcm as Float32Array<ArrayBuffer>, 0);
      this.buffers.set(k, buf);
    }
  }

  /** ms desde el inicio de la etapa 1 (negativo en la entrada previa). */
  now(): number {
    return Math.round((this.ctx.currentTime - this.anchor) * 1000);
  }

  play(kind: IftSignal, atCtxTime = this.ctx.currentTime) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers.get(kind)!;
    src.connect(this.ctx.destination);
    src.start(atCtxTime);
  }

  /** Arranca (o retoma) el cronograma con t = startAtMs ahora. */
  async start(schedule: IftEvent[], startAtMs: number, lateSkipMs: number) {
    await this.ctx.resume();
    this.anchor = this.ctx.currentTime - startAtMs / 1000;
    this.idx = schedule.findIndex((e) => e.t >= startAtMs);
    if (this.idx < 0) this.idx = schedule.length;
    const LOOKAHEAD = 250;
    const tick = () => {
      const now = this.now();
      while (this.idx < schedule.length && schedule[this.idx].t <= now + LOOKAHEAD) {
        const e = schedule[this.idx++];
        if (e.t < now - lateSkipMs) {
          this.skipped++;
          continue;
        }
        this.play(e.kind, this.anchor + e.t / 1000);
      }
    };
    tick();
    this.timer = setInterval(tick, 40);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async close() {
    this.stop();
    try {
      await this.ctx.close();
    } catch {
      /* ya cerrado */
    }
  }
}
