// Lector mínimo de MP4/MOV: tiempos de cada cuadro de video y la tasa de
// captura de los metadatos, sin decodificar ni subir el archivo.
//   * stts/ctts/mdhd del track de video → tiempos de presentación
//   * moov/meta (keys + ilst) → com.android.capture.fps,
//     com.apple.quicktime.*capture*fps* (cámara lenta reajustada)

export type ReadRange = (start: number, end: number) => Promise<Uint8Array>;

export interface Mp4VideoInfo {
  ptsSec: number[]; // tiempos de presentación (ordenados), en segundos de la línea de tiempo
  durationSec: number;
  codec: string;
  width: number;
  height: number;
  captureFps: number | null;
  hasAudio: boolean;
}

export class Mp4Error extends Error {}

const type4 = (b: Uint8Array, o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
const u32 = (dv: DataView, o: number) => dv.getUint32(o);

interface Box {
  type: string;
  start: number; // inicio del contenido (después del header)
  end: number;
}

function children(b: Uint8Array, start: number, end: number): Box[] {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out: Box[] = [];
  let o = start;
  while (o + 8 <= end) {
    let size = u32(dv, o);
    const type = type4(b, o + 4);
    let header = 8;
    if (size === 1) {
      size = Number(dv.getBigUint64(o + 8));
      header = 16;
    } else if (size === 0) size = end - o;
    if (size < header || o + size > end) break;
    out.push({ type, start: o + header, end: o + size });
    o += size;
  }
  return out;
}
const find = (b: Uint8Array, box: Box, type: string, skip = 0) => children(b, box.start + skip, box.end).find((c) => c.type === type);

/** Busca la caja moov recorriendo sólo los headers del archivo. */
async function readMoov(read: ReadRange, size: number): Promise<Uint8Array> {
  let o = 0;
  while (o + 8 <= size) {
    const h = await read(o, Math.min(o + 16, size));
    const dv = new DataView(h.buffer, h.byteOffset, h.byteLength);
    let boxSize = dv.getUint32(0);
    const type = type4(h, 4);
    if (boxSize === 1) boxSize = Number(dv.getBigUint64(8));
    else if (boxSize === 0) boxSize = size - o;
    if (boxSize < 8) break;
    if (type === "moov") {
      if (boxSize > 64 * 1024 * 1024) throw new Mp4Error("Los metadatos del video son demasiado grandes.");
      return read(o, o + boxSize);
    }
    o += boxSize;
  }
  throw new Mp4Error("No es un video MP4/MOV que se pueda leer.");
}

function metaCaptureFps(b: Uint8Array, meta: Box): number | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  // 'meta' de QuickTime no es "full box"; el de ISO sí (4 bytes de versión).
  const skip = type4(b, meta.start + 4) === "hdlr" ? 0 : 4;
  const kids = children(b, meta.start + skip, meta.end);
  const keys = kids.find((k) => k.type === "keys");
  const ilst = kids.find((k) => k.type === "ilst");
  if (!keys || !ilst) return null;
  const names: string[] = [];
  const count = u32(dv, keys.start + 4);
  let o = keys.start + 8;
  for (let i = 0; i < count && o + 8 <= keys.end; i++) {
    const sz = u32(dv, o);
    names.push(new TextDecoder().decode(b.subarray(o + 8, o + sz)));
    o += sz;
  }
  for (const item of children(b, ilst.start, ilst.end)) {
    const idx = u32(dv, item.start - 4); // el "tipo" del item es el índice (1-based) de la clave
    const name = names[idx - 1] ?? "";
    if (!/capture\.?fps|capture-?frame-?rate/i.test(name)) continue;
    const data = children(b, item.start, item.end).find((c) => c.type === "data");
    if (!data) continue;
    const wellKnown = u32(dv, data.start) & 0xffffff;
    const v = data.start + 8;
    const len = data.end - v;
    let val: number | null = null;
    if (wellKnown === 23 && len >= 4) val = dv.getFloat32(v);
    else if (wellKnown === 24 && len >= 8) val = dv.getFloat64(v);
    else if ((wellKnown === 21 || wellKnown === 22) && len >= 1) val = len >= 4 ? dv.getInt32(v) : len === 2 ? dv.getInt16(v) : dv.getInt8(v);
    else if (wellKnown === 1) val = Number(new TextDecoder().decode(b.subarray(v, data.end)));
    if (val !== null && Number.isFinite(val) && val > 0) return val;
  }
  return null;
}

export function parseMoov(moov: Uint8Array): Mp4VideoInfo {
  const dv = new DataView(moov.buffer, moov.byteOffset, moov.byteLength);
  const root: Box = { type: "moov", start: 8, end: moov.byteLength };
  let video: { mdia: Box; timescale: number; durationSec: number } | null = null;
  let hasAudio = false;
  for (const trak of children(moov, root.start, root.end).filter((c) => c.type === "trak")) {
    const mdia = find(moov, trak, "mdia");
    if (!mdia) continue;
    const hdlr = find(moov, mdia, "hdlr");
    const handler = hdlr ? type4(moov, hdlr.start + 8) : "";
    if (handler === "soun") hasAudio = true;
    if (handler !== "vide" || video) continue;
    const mdhd = find(moov, mdia, "mdhd")!;
    const v1 = moov[mdhd.start] === 1;
    const timescale = u32(dv, mdhd.start + (v1 ? 20 : 12));
    const duration = v1 ? Number(dv.getBigUint64(mdhd.start + 24)) : u32(dv, mdhd.start + 16);
    video = { mdia, timescale, durationSec: duration / timescale };
  }
  if (!video) throw new Mp4Error("El archivo no tiene video.");
  const minf = find(moov, video.mdia, "minf");
  const stbl = minf && find(moov, minf, "stbl");
  if (!stbl) throw new Mp4Error("El video no tiene tabla de cuadros.");
  const stts = find(moov, stbl, "stts");
  if (!stts) throw new Mp4Error("El video no tiene tiempos de cuadro.");

  // Tiempos de decodificación
  const dts: number[] = [];
  let t = 0;
  for (let i = 0, n = u32(dv, stts.start + 4), o = stts.start + 8; i < n; i++, o += 8) {
    const count = u32(dv, o);
    const delta = u32(dv, o + 4);
    for (let k = 0; k < count; k++) {
      dts.push(t);
      t += delta;
    }
  }
  // Corrimiento de composición (cuadros B)
  const ctts = find(moov, stbl, "ctts");
  const pts = dts.slice();
  if (ctts) {
    const signed = moov[ctts.start] === 1;
    let idx = 0;
    for (let i = 0, n = u32(dv, ctts.start + 4), o = ctts.start + 8; i < n; i++, o += 8) {
      const count = u32(dv, o);
      const off = signed ? dv.getInt32(o + 4) : u32(dv, o + 4);
      for (let k = 0; k < count && idx < pts.length; k++) pts[idx++] += off;
    }
  }
  pts.sort((a, b) => a - b);
  const p0 = pts[0] ?? 0;

  // Códec y tamaño (primera entrada de stsd)
  const stsd = find(moov, stbl, "stsd");
  let codec = "";
  let width = 0;
  let height = 0;
  if (stsd) {
    const entry = children(moov, stsd.start + 8, stsd.end)[0];
    if (entry) {
      codec = entry.type;
      width = dv.getUint16(entry.start + 24);
      height = dv.getUint16(entry.start + 26);
    }
  }

  // Metadatos de captura (moov/meta o moov/udta/meta)
  let captureFps: number | null = null;
  const metas: Box[] = [];
  const top = children(moov, root.start, root.end);
  metas.push(...top.filter((c) => c.type === "meta"));
  for (const udta of top.filter((c) => c.type === "udta")) metas.push(...children(moov, udta.start, udta.end).filter((c) => c.type === "meta"));
  for (const m of metas) captureFps = captureFps ?? metaCaptureFps(moov, m);

  return {
    ptsSec: pts.map((x) => (x - p0) / video!.timescale),
    durationSec: video.durationSec,
    codec,
    width,
    height,
    captureFps,
    hasAudio,
  };
}

export async function readMp4Info(read: ReadRange, size: number): Promise<Mp4VideoInfo> {
  return parseMoov(await readMoov(read, size));
}

/** Lector para un File/Blob del navegador. */
export const blobReader = (blob: Blob): ReadRange => async (start, end) => new Uint8Array(await blob.slice(start, end).arrayBuffer());
