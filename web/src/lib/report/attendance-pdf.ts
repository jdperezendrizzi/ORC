// PDF de una página con el resumen de asistencia (uso interno del staff).

import type { AttendanceReport } from "../attendance-report";
import { LOW_PCT } from "../attendance-report";

export async function buildAttendancePdf(
  r: AttendanceReport,
  meta: { categoryName: string; periodLabel: string; seasonName: string; insights?: string[] },
  crestDataUrl: string | null,
): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const H = 297;
  const M = 14;
  const ORANGE: [number, number, number] = [241, 136, 42];
  const BLACK: [number, number, number] = [35, 31, 32];
  const MUTED: [number, number, number] = [96, 90, 85];
  const BAD: [number, number, number] = [185, 28, 28];

  const header = () => {
    doc.setFillColor(...BLACK);
    doc.rect(0, 0, W, 30, "F");
    doc.setFillColor(...ORANGE);
    doc.rect(0, 30, W, 1.4, "F");
    if (crestDataUrl) doc.addImage(crestDataUrl, "PNG", M, 4.5, 19.8, 22, "crest", "FAST");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.text("ORC", M + 25, 15);
    doc.setTextColor(...ORANGE);
    doc.text("Rendimiento", M + 25 + doc.getTextWidth("ORC "), 15);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(255, 255, 255);
    doc.text(`Asistencia · ${meta.categoryName} · ${meta.periodLabel}`, M + 25, 22);
  };
  header();

  let y = 42;
  doc.setTextColor(...BLACK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(`${r.avgPct ?? "—"} %`, M, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(...MUTED);
  doc.text(
    `asistencia promedio · ${r.practices} prácticas · ${r.matches} partidos · temporada ${meta.seasonName}`,
    M + 30,
    y - 1,
  );
  y += 6;
  if (r.practicePct !== null || r.matchPct !== null) {
    doc.setFontSize(10.5);
    doc.setTextColor(...BLACK);
    doc.text(`Prácticas ${r.practicePct ?? "—"} %   ·   Partidos ${r.matchPct ?? "—"} %`, M, y);
    y += 6;
  }
  const insights = meta.insights ?? [];
  if (insights.length) {
    doc.setFontSize(9.5);
    doc.setTextColor(...MUTED);
    for (const t of insights) {
      const lines = doc.splitTextToSize(`• ${t}`, W - 2 * M) as string[];
      doc.text(lines, M, y);
      y += lines.length * 4.6;
    }
  }
  y += 4;

  // Gráfico semana a semana (prácticas y partidos), igual que en la app
  const first = r.weeks.findIndex((w) => w.pct !== null);
  const weeks = first < 0 ? [] : r.weeks.slice(first).slice(-20);
  const hasP = weeks.some((w) => w.practicePct !== null);
  const hasM = weeks.some((w) => w.matchPct !== null);
  if (weeks.length) {
    const BLUE: [number, number, number] = [3, 105, 161];
    const GRID: [number, number, number] = [217, 212, 207];
    const chartH = 42;
    const top = y + 6;
    const base = top + chartH;
    const left = M + 8;
    const width = W - M - left;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(...BLACK);
    doc.text("Semana a semana", M, y + 1);
    // Leyenda
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    let lx = W - M;
    const legend = [...(hasM ? [{ c: BLUE, t: "Partidos" }] : []), ...(hasP ? [{ c: ORANGE, t: "Prácticas" }] : [])];
    for (const l of legend) {
      const tw = doc.getTextWidth(l.t);
      lx -= tw;
      doc.setTextColor(...MUTED);
      doc.text(l.t, lx, y + 1);
      lx -= 4.5;
      doc.setFillColor(...l.c);
      doc.rect(lx, y - 1.6, 3, 3, "F");
      lx -= 5;
    }
    // Líneas guía 0 / 50 / 100 %
    doc.setDrawColor(...GRID);
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    for (const v of [0, 50, 100]) {
      const gy = base - (v / 100) * chartH;
      doc.line(left, gy, W - M, gy);
      doc.text(`${v}`, left - 1.5, gy + 1, { align: "right" });
    }
    const slot = width / weeks.length;
    const series = [...(hasP ? ["p"] : []), ...(hasM ? ["m"] : [])];
    const barW = Math.min(7, (slot * 0.8) / series.length);
    weeks.forEach((w, i) => {
      const cx = left + slot * i + slot / 2;
      const startX = cx - (barW * series.length) / 2;
      series.forEach((k, j) => {
        const pct = k === "p" ? w.practicePct : w.matchPct;
        if (pct === null) return;
        const h = Math.max(0.6, (pct / 100) * chartH);
        const x = startX + j * barW;
        doc.setFillColor(...(k === "p" ? ORANGE : BLUE));
        doc.rect(x + 0.3, base - h, barW - 0.6, h, "F");
        doc.setFontSize(6.5);
        doc.setTextColor(...(pct < LOW_PCT ? BAD : BLACK));
        doc.text(String(pct), x + barW / 2, base - h - 1, { align: "center" });
      });
      doc.setFontSize(6.5);
      doc.setTextColor(...MUTED);
      doc.text(`${Number(w.weekStart.slice(8, 10))}/${Number(w.weekStart.slice(5, 7))}`, cx, base + 4, { align: "center" });
    });
    y = base + 11;
  } else {
    y += 2;
  }

  // Tabla
  const cols = [M, 92, 108, 124, 146, 166, 182];
  const head = ["Jugador", "Pres.", "Aus.", "Just.", "Práct.", "Partidos", "Total"];
  const row = (vals: string[], bold = false, color: [number, number, number] = BLACK) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setTextColor(...color);
    vals.forEach((v, i) => doc.text(v, cols[i] + (i === 0 ? 0 : 8), y, { align: i === 0 ? "left" : "right" }));
  };
  doc.setFontSize(10);
  doc.setFillColor(237, 234, 230);
  doc.rect(M - 2, y - 5, W - 2 * M + 4, 7.5, "F");
  row(head, true);
  y += 7;
  for (const p of r.players) {
    if (y > H - 20) {
      doc.addPage();
      header();
      y = 42;
    }
    const low = p.pct !== null && p.pct < LOW_PCT;
    const pc = (v: number | null) => (v === null ? "—" : `${v} %`);
    row([p.name, String(p.present), String(p.absent), String(p.excused), pc(p.practicePct), pc(p.matchPct), pc(p.pct)], low, low ? BAD : BLACK);
    doc.setDrawColor(217, 212, 207);
    doc.line(M - 2, y + 2, W - M + 2, y + 2);
    y += 7;
  }

  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text(
    `Asistencia % = presentes / (presentes + ausentes); las justificadas no cuentan. En rojo, menos de ${LOW_PCT} %. Uso interno del cuerpo técnico.`,
    M,
    H - 10,
  );
  return doc.output("blob");
}
