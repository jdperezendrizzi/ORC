// PDF «Objetivos de la temporada» de una categoría (uso interno del cuerpo técnico).

import { objectiveStatusLabel, type ObjectiveStatus } from "../objectives";
import type { ObjectivesReport } from "../objectives-report";

const dm = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;

export async function buildObjectivesPdf(r: ObjectivesReport, crestDataUrl: string | null): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const H = 297;
  const M = 14;
  const ORANGE: [number, number, number] = [246, 95, 1];
  const AMBER: [number, number, number] = [251, 191, 36];
  const GREYB: [number, number, number] = [113, 113, 122];
  const BLACK: [number, number, number] = [35, 31, 32];
  const MUTED: [number, number, number] = [96, 90, 85];
  const GRID: [number, number, number] = [217, 212, 207];
  const EMPTY: [number, number, number] = [237, 234, 230];
  const COLOR: Record<ObjectiveStatus | "unmarked", [number, number, number]> = { achieved: ORANGE, in_progress: AMBER, not_yet: GREYB, unmarked: EMPTY };
  // jsPDF (helvetica) no tiene los símbolos ✓ ◐ ✕: en el PDF van como texto + color
  const TAG: Record<ObjectiveStatus, string> = { achieved: "LOGRADO", in_progress: "EN PROGRESO", not_yet: "TODAVÍA NO" };

  const header = () => {
    doc.setFillColor(...BLACK);
    doc.rect(0, 0, W, 30, "F");
    doc.setFillColor(...ORANGE);
    doc.rect(0, 30, W, 1.4, "F");
    if (crestDataUrl) doc.addImage(crestDataUrl, "PNG", M, 4.5, 20.2, 22, "crest", "FAST"); // proporción del escudo (514×560)
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.text("ORC", M + 25, 15);
    doc.setTextColor(...ORANGE);
    doc.text("Rendimiento", M + 25 + doc.getTextWidth("ORC "), 15);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(255, 255, 255);
    doc.text(`Objetivos de la temporada · ${r.categoryName} · ${dm(r.today)} · temporada ${r.seasonName}`, M + 25, 22);
  };
  header();
  let y = 42;
  const ensure = (h: number) => {
    if (y + h > H - 16) {
      doc.addPage();
      header();
      y = 42;
    }
  };
  const title = (t: string) => {
    ensure(22);
    y += 3;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12.5);
    doc.setTextColor(...BLACK);
    doc.text(t, M, y);
    doc.setDrawColor(...ORANGE);
    doc.setLineWidth(0.5);
    doc.line(M, y + 1.6, M + 22, y + 1.6);
    y += 7.5;
  };

  // Números grandes
  const c = r.counts;
  const big: [string, string, [number, number, number]][] = [
    [String(c.achieved), "logrados", ORANGE],
    [String(c.in_progress), "en progreso", [180, 120, 0]],
    [String(c.not_yet), "todavía no", GREYB],
    [String(c.unmarked), "sin marcar", MUTED],
  ];
  big.forEach(([n, l, col], k) => {
    const x = M + k * 46;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(...col);
    doc.text(n, x, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(l, x, y + 5);
  });
  y += 11;
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(r.kind === "team" ? `Sobre ${r.total} objetivos del equipo.` : `Sobre ${r.total} marcas (jugador × objetivo).`, M, y);
  y += 5;

  // Barra apilada por área
  const stacked = (label: string, counts: ObjectivesReport["counts"], total: number) => {
    ensure(9);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...BLACK);
    doc.text(label, M, y + 3.6);
    const x0 = M + 40;
    const w = W - M - x0 - 22;
    let x = x0;
    for (const k of ["achieved", "in_progress", "not_yet", "unmarked"] as const) {
      const ww = total ? (counts[k] / total) * w : 0;
      if (ww > 0) {
        doc.setFillColor(...COLOR[k]);
        doc.rect(x, y, ww, 5, "F");
        x += ww;
      }
    }
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(`${counts.achieved}/${total} logrados`, W - M, y + 3.6, { align: "right" });
    y += 7.5;
  };
  title("Por área");
  for (const a of r.byArea) stacked(a.label, a.counts, a.total);
  y += 3;
  // Leyenda
  doc.setFontSize(8);
  let lx = M;
  for (const k of ["achieved", "in_progress", "not_yet", "unmarked"] as const) {
    doc.setFillColor(...COLOR[k]);
    doc.rect(lx, y - 2.6, 3, 3, "F");
    doc.setTextColor(...MUTED);
    const t = k === "unmarked" ? "Sin marcar" : objectiveStatusLabel[k];
    doc.text(t, lx + 4.2, y);
    lx += 6 + doc.getTextWidth(t) + 6;
  }
  y += 5;

  // Evolución de la temporada
  if (r.timeline.length >= 2) {
    title("Evolución de la temporada");
    const chartH = 40;
    ensure(chartH + 14);
    const left = M + 8;
    const right = W - M;
    const top = y;
    const base = top + chartH;
    const max = Math.max(1, r.kind === "team" ? r.total : r.total);
    doc.setDrawColor(...GRID);
    doc.setLineWidth(0.2);
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    for (const v of [0, Math.round(max / 2), max]) {
      const gy = base - (v / max) * chartH;
      doc.line(left, gy, right, gy);
      doc.text(String(v), left - 1.5, gy + 1, { align: "right" });
    }
    const n = r.timeline.length;
    const X = (i: number) => left + ((right - left) * i) / (n - 1);
    const Y = (v: number) => base - (v / max) * chartH;
    const line = (vals: number[], col: [number, number, number]) => {
      doc.setDrawColor(...col);
      doc.setLineWidth(0.8);
      for (let i = 1; i < n; i++) doc.line(X(i - 1), Y(vals[i - 1]), X(i), Y(vals[i]));
      doc.setFillColor(...col);
      vals.forEach((v, i) => doc.circle(X(i), Y(v), 0.8, "F"));
    };
    line(r.timeline.map((t) => t.inProgress), AMBER);
    line(r.timeline.map((t) => t.achieved), ORANGE);
    const step = Math.max(1, Math.ceil(n / 8));
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    r.timeline.forEach((t, i) => {
      if (i % step === 0 || i === n - 1) doc.text(dm(t.week), X(i), base + 4, { align: "center" });
    });
    doc.setFontSize(8);
    doc.setFillColor(...ORANGE);
    doc.rect(M, base + 7, 3, 3, "F");
    doc.text("Logrados", M + 4.5, base + 9.6);
    doc.setFillColor(...AMBER);
    doc.rect(M + 24, base + 7, 3, 3, "F");
    doc.text("En progreso", M + 28.5, base + 9.6);
    doc.text("Cantidad al cierre de cada semana", W - M, base + 9.6, { align: "right" });
    y = base + 15;
  }

  // Detalle
  if (r.kind === "team") {
    for (const st of ["achieved", "in_progress", "not_yet", null] as (ObjectiveStatus | null)[]) {
      const list = r.items.filter((i) => i.status === st);
      if (!list.length) continue;
      title(st ? `${objectiveStatusLabel[st]} (${list.length})` : `Sin marcar (${list.length})`);
      for (const i of list) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        const lines = doc.splitTextToSize(i.title, W - 2 * M - 52) as string[];
        ensure(lines.length * 4.6 + 1.5);
        if (st) {
          doc.setFillColor(...COLOR[st]);
          doc.roundedRect(M, y - 3.4, 24, 4.6, 1, 1, "F");
          doc.setFontSize(6.5);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(st === "in_progress" ? 35 : 255, st === "in_progress" ? 31 : 255, st === "in_progress" ? 32 : 255);
          doc.text(TAG[st], M + 12, y - 0.3, { align: "center" });
        }
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(...BLACK);
        doc.text(lines, M + 27, y);
        doc.setFontSize(8);
        doc.setTextColor(...MUTED);
        if (i.since) doc.text(`desde ${dm(i.since)}`, W - M, y, { align: "right" });
        y += lines.length * 4.6 + 1.5;
      }
    }
  } else {
    title("Por objetivo");
    for (const p of r.perPlayer) stacked(p.title.length > 34 ? `${p.title.slice(0, 33)}…` : p.title, p.counts, p.players);
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text("Uso interno del cuerpo técnico.", M, H - 8);
    doc.text(`${p}/${pages}`, W - M, H - 8, { align: "right" });
  }
  return doc.output("blob");
}
