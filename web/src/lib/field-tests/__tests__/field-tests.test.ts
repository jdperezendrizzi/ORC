import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cmjLive, cmjPrecisionCm, frameCount, frameTimeMs, heightFromFlight } from "../cmj";
import { conePosition, fovNeededDeg, sprintFramesError, sprintSetup, sprintTimes, vmaxPrecision } from "../sprint";
import {
  allOut,
  buildSchedule,
  completedStageAt,
  finalStages,
  initRun,
  lastLineBefore,
  linesInStage,
  markRun,
  undoRun,
  vift,
} from "../ift";
import { classify, newSeries, nextStimulus, recordTrial, seededRandom, seriesResult, seriesStatus, validCount } from "../reaction";
import { cmjBaseline, cmjVerdict } from "../baseline";
import { analyzeTiming, mediaTimeForFrame, roundFps } from "../video-timing";
import { parseMoov, readMp4Info } from "../mp4";
import { DEFAULT_PARAMS, parseDecimal, withDefaults } from "../protocol";
import { attemptMetrics, AttemptInputError } from "../metrics";

const IFT = DEFAULT_PARAMS.ift_30_15;
const REAC = DEFAULT_PARAMS.reaction;
const W = DEFAULT_PARAMS.cmj.weekly;

describe("CMJ", () => {
  it("h = g·t²/8", () => {
    expect(heightFromFlight(0.5)).toBeCloseTo(30.656, 3);
  });
  it("cuadro: se pide el centro; cantidad desde la duración del archivo", () => {
    expect(frameTimeMs(0, 240)).toBeCloseTo(2.083, 3);
    expect(frameTimeMs(10, 240)).toBeCloseTo(43.75, 2);
    expect(frameCount(8000, 240)).toBe(1920);
  });
  it("precisión: ±1 cuadro mueve ~0,6 cm a 240 fps y ~4,6 cm a 30 fps en un salto de 40 cm", () => {
    // 40 cm ≈ 571 ms de vuelo
    const t = Math.sqrt((0.4 * 8) / 9.81);
    expect(cmjPrecisionCm(0, Math.round(t * 240), 240)).toBeGreaterThan(0.5);
    expect(cmjPrecisionCm(0, Math.round(t * 240), 240)).toBeLessThan(0.75);
    expect(cmjPrecisionCm(0, Math.round(t * 30), 30)).toBeGreaterThan(4);
    expect(cmjPrecisionCm(0, Math.round(t * 30), 30)).toBeLessThan(5.5);
  });
  it("vista en vivo sólo con las dos marcas en orden", () => {
    expect(cmjLive({ takeoff: 100, landing: null, fps: 240 })).toBeNull();
    expect(cmjLive({ takeoff: 100, landing: 90, fps: 240 })).toBeNull();
    expect(cmjLive({ takeoff: 100, landing: 220, fps: 240 })?.heightCm).toBeCloseTo(30.656, 3);
  });
});

describe("Sprint", () => {
  it("tiempos, Vmax y su precisión", () => {
    const r = sprintTimes({ startFrame: 10, frame10: 430, frame20: 730, frame40: 1270 }, 240);
    expect(r.t10).toBeCloseTo(1.75, 5);
    expect(r.t20).toBeCloseTo(3, 5);
    expect(r.t40).toBeCloseTo(5.25, 5);
    expect(r.vmax).toBeCloseTo(8.889, 3);
    expect(vmaxPrecision(r.t20, r.t40, 240)).toBeCloseTo(0.0165, 3);
  });
  it("valida orden y enteros", () => {
    expect(sprintFramesError({ startFrame: 0, frame20: 700, frame40: 1200 })).toBeNull();
    expect(sprintFramesError({ startFrame: 0, frame10: 800, frame20: 700, frame40: 1200 })).toMatch(/orden/);
    expect(sprintFramesError({ startFrame: 0, frame20: 700 })).toMatch(/Faltan/);
    expect(sprintFramesError({ startFrame: 0.5, frame20: 700, frame40: 1200 })).toMatch(/enteros/);
  });
  it("armado: campo de visión y conos por paralaje", () => {
    expect(fovNeededDeg(35)).toBeCloseTo(59.49, 1);
    expect(conePosition(20, 20, 35, 2)).toBe(20);
    expect(conePosition(0, 20, 35, 2)).toBeCloseTo(-1.143, 3);
    expect(conePosition(40, 20, 35, 2)).toBeCloseTo(41.143, 3);
    expect(sprintSetup(35, 2).fits).toBe(true);
    const near = sprintSetup(12, 2);
    expect(near.fits).toBe(false);
    expect(near.warnings.join(" ")).toMatch(/gran angular/);
    expect(near.warnings.join(" ")).toMatch(/de costado/);
  });
});

describe("30-15 IFT", () => {
  it("VIFT = 8 + (etapa − 1)·0,5; sin etapa 1 no hay", () => {
    expect(vift(17, IFT)).toBe(16);
    expect(vift(1, IFT)).toBe(8);
    expect(vift(0, IFT)).toBeNull();
  });
  it("señales: línea k en k·L·3600/v ms; numeradas en todo el test", () => {
    const s = buildSchedule(IFT, 3);
    // Etapa 1 (8 km/h): 20 m cada 9000 ms → 9000, 18000, 27000
    expect(s.filter((e) => e.stage === 1 && e.kind === "line").map((e) => e.t)).toEqual([9000, 18000, 27000]);
    expect(s.filter((e) => e.kind === "countdown" && e.stage === 1).map((e) => e.t)).toEqual([-3000, -2000, -1000]);
    expect(s.find((e) => e.stage === 2 && e.kind === "start")?.t).toBe(45000);
    const lines = s.filter((e) => e.kind === "line").map((e) => e.lineIndex);
    expect(lines).toEqual(lines.map((_, i) => i + 1));
    expect(s.at(-1)?.kind).toBe("end_test");
    expect(linesInStage(1, IFT)).toBe(3);
  });
  it("«Terminó»: n−1 en la carrera, n en la pausa (salvo los primeros 2 s), 0 en la entrada", () => {
    expect(completedStageAt(-5000, IFT)).toBe(0);
    expect(completedStageAt(10_000, IFT)).toBe(0); // carrera etapa 1
    expect(completedStageAt(31_000, IFT)).toBe(0); // pausa, dentro del margen
    expect(completedStageAt(33_000, IFT)).toBe(1); // pausa etapa 1
    expect(completedStageAt(50_000, IFT)).toBe(1); // carrera etapa 2
  });
  it("3 «No llegó» seguidos (aunque crucen etapas) → etapa anterior a la de la 3ª falta; deshacer", () => {
    let st = initRun(["a", "b"]);
    st = markRun(st, { type: "miss", playerId: "a", lineIndex: 3, stage: 1 }, IFT);
    st = markRun(st, { type: "miss", playerId: "a", lineIndex: 4, stage: 2 }, IFT);
    expect(st.players.a.status).toBe("running");
    st = markRun(st, { type: "miss", playerId: "a", lineIndex: 5, stage: 2 }, IFT);
    expect(st.players.a).toMatchObject({ status: "out", lastStage: 1, reason: "misses" });
    st = undoRun(st, IFT);
    expect(st.players.a.status).toBe("running");
    expect(st.players.a.misses).toEqual([3, 4]);
    // Faltas no seguidas no lo sacan
    st = markRun(st, { type: "miss", playerId: "a", lineIndex: 7, stage: 2 }, IFT);
    expect(st.players.a.status).toBe("running");
    st = markRun(st, { type: "finish", playerId: "b", t: 50_000 }, IFT);
    expect(st.players.b).toMatchObject({ status: "out", lastStage: 1 });
    expect(allOut(st)).toBe(false);
    expect(finalStages(st, 95_000, IFT).a).toEqual({ lastStage: 2, reason: "end" });
  });
  it("«No llegó» va a la última señal de línea sonada", () => {
    const s = buildSchedule(IFT, 2);
    expect(lastLineBefore(s, 20_000)?.lineIndex).toBe(2);
    expect(lastLineBefore(s, 5_000)).toBeNull();
  });
});

describe("Reacción", () => {
  it("clasifica cada estímulo", () => {
    expect(classify("go", -200, REAC)).toBe("anticipation");
    expect(classify("go", 80, REAC)).toBe("anticipation");
    expect(classify("go", 250, REAC)).toBe("valid");
    expect(classify("go", null, REAC)).toBe("lapse");
    expect(classify("nogo", 300, REAC)).toBe("commission");
    expect(classify("nogo", null, REAC)).toBe("correct_rejection");
  });
  it("go/no-go: nunca el primero, nunca más de 2 seguidos, al menos uno en la práctica", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rnd = seededRandom(seed);
      let s = newSeries("gonogo");
      let guard = 0;
      while (seriesStatus(s, REAC) === "running" && guard++ < 100) {
        const st = nextStimulus(s, REAC, rnd);
        expect(st.waitMs).toBeGreaterThanOrEqual(1000);
        expect(st.waitMs).toBeLessThanOrEqual(3000);
        s = recordTrial(s, st, st.kind === "go" ? 250 : null, REAC);
      }
      expect(s.trials[0].kind).toBe("go");
      expect(s.trials.filter((t) => t.practice).some((t) => t.kind === "nogo")).toBe(true);
      const kinds = s.trials.map((t) => t.kind).join("");
      expect(kinds).not.toMatch(/nogonogonogo/);
      expect(validCount(s)).toBe(5);
      expect(s.trials.filter((t) => t.practice)).toHaveLength(3);
    }
  });
  it("anticipaciones y lapsos se repiten; tope de 20 deja la serie incompleta", () => {
    const rnd = seededRandom(7);
    let s = newSeries("simple");
    const st = nextStimulus(s, REAC, rnd);
    s = recordTrial(s, st, 50, REAC);
    expect(s.repeat).not.toBeNull();
    for (let i = 0; i < 40 && seriesStatus(s, REAC) === "running"; i++) s = recordTrial(s, nextStimulus(s, REAC, rnd), null, REAC);
    expect(seriesStatus(s, REAC)).toBe("incomplete");
  });
  it("resultado: promedio de válidos y errores en notas", () => {
    const rnd = seededRandom(3);
    let s = newSeries("simple");
    const rts = [400, 400, 400, 200, 220, 240, 260, 280];
    s = recordTrial(s, nextStimulus(s, REAC, rnd), 40, REAC); // anticipación en práctica
    for (const rt of rts) s = recordTrial(s, nextStimulus(s, REAC, rnd), rt, REAC);
    expect(seriesStatus(s, REAC)).toBe("complete");
    expect(seriesResult(s)).toEqual({ meanMs: 240, notes: "Sin errores." });
  });
});

describe("CMJ semanal", () => {
  const pts = [
    { date: "2026-10-01", value: 40, method: "app" },
    { date: "2026-10-01", value: 42, method: "app" },
    { date: "2026-10-10", value: 38, method: "app" },
    { date: "2026-10-20", value: 41, method: "manual" },
    { date: "2026-10-25", value: 40, method: "app" },
    { date: "2026-08-01", value: 50, method: "app" }, // fuera de los 42 días
  ];
  it("promedio del mejor de cada día, mismo método, 42 días antes", () => {
    expect(cmjBaseline(pts, "2026-11-01", "app", W)).toEqual({ value: 40, days: 3, needed: 3 });
    expect(cmjBaseline(pts, "2026-11-01", "manual", W)).toEqual({ value: null, days: 1, needed: 3 });
    // El día de hoy no cuenta para su propia base
    expect(cmjBaseline(pts, "2026-10-25", "app", W).days).toBe(2);
  });
  it("veredicto: >7 % por debajo = atención; >12 % crítico", () => {
    expect(cmjVerdict(38, 40, W).level).toBe("ok");
    expect(cmjVerdict(37, 40, W).level).toBe("warn");
    expect(cmjVerdict(34, 40, W).level).toBe("crit");
  });
});

describe("Protocolo y entradas", () => {
  it("coma decimal y defaults", () => {
    expect(parseDecimal("41,5")).toBe(41.5);
    expect(parseDecimal("abc")).toBeNull();
    expect(parseDecimal("-3")).toBeNull();
    expect(withDefaults("cmj", { g: 9.8 }).weekly.warn_drop_pct).toBe(7);
  });
  it("errores de entrada claros", () => {
    expect(() => attemptMetrics("cmj", "video", { takeoffFrame: 1, landingFrame: 30, frameRateFps: 60 }, { min_fps: 120 })).toThrow(AttemptInputError);
    expect(() => attemptMetrics("sprint_40", "manual", { t20: 3, t40: 2.9 }, {})).toThrow(/crecer/);
  });
});

// ---------------------------------------------------------------------
// Video importado
// ---------------------------------------------------------------------
const fixture = (name: string) => new Uint8Array(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))));
const reader = (buf: Uint8Array) => async (s: number, e: number) => buf.subarray(s, e);

describe("Lectura de MP4/MOV", () => {
  it("cámara lenta real a 240 fps (con cuadros B)", async () => {
    const buf = fixture("slow240.mp4");
    const info = await readMp4Info(reader(buf), buf.length);
    expect(info.ptsSec).toHaveLength(60);
    expect(info.captureFps).toBeCloseTo(240, 3);
    expect(info.codec).toBe("avc1");
    expect(info.width).toBe(64);
    expect(info.hasAudio).toBe(false);
    const t = analyzeTiming(info.ptsSec, info.captureFps, 120);
    expect(t).toMatchObject({ ok: true, fps: 240, timelineScale: 1 });
  });
  it("cámara lenta reajustada (240 capturados que se ven a 30): mide con 240 y escala ×8", async () => {
    const buf = fixture("retimed30.mp4");
    const info = await readMp4Info(reader(buf), buf.length);
    const t = analyzeTiming(info.ptsSec, info.captureFps, 120);
    expect(t.ok).toBe(true);
    expect(t.fps).toBe(240);
    expect(t.timelineFps).toBeCloseTo(30, 3);
    expect(t.timelineScale).toBeCloseTo(8, 3);
    // El cuadro 10 se pide en su tiempo real del archivo (centro del cuadro)
    expect(mediaTimeForFrame(10, info.ptsSec, t.medianInterval)).toBeCloseTo(10 / 30 + 1 / 60, 4);
  });
  it("MOV de QuickTime con la tasa de captura en los metadatos", async () => {
    const buf = fixture("slow240.mov");
    const info = await readMp4Info(reader(buf), buf.length);
    expect(info.captureFps).toBe(240);
    expect(analyzeTiming(info.ptsSec, info.captureFps, 120).ok).toBe(true);
  });
  it("rechaza video que mezcla velocidades", async () => {
    const buf = fixture("mixed.mp4");
    const info = await readMp4Info(reader(buf), buf.length);
    expect(analyzeTiming(info.ptsSec, info.captureFps, 120)).toMatchObject({ ok: false, reason: "variable_rate" });
  });
  it("rechaza video normal (30 fps) y detecta el audio", async () => {
    const buf = fixture("normal30.mp4");
    const info = await readMp4Info(reader(buf), buf.length);
    expect(info.hasAudio).toBe(true);
    expect(analyzeTiming(info.ptsSec, info.captureFps, 120)).toMatchObject({ ok: false, reason: "low_fps", fps: 30 });
  });
  it("no es un video", () => {
    expect(() => parseMoov(new Uint8Array(16))).toThrow();
  });
  it("redondeo a tasas estándar", () => {
    expect(roundFps(239.7)).toBe(240);
    expect(roundFps(119.4)).toBe(120);
    expect(roundFps(200)).toBe(200);
  });
});
