// PDF «Estado del equipo» (uso interno del cuerpo técnico).

import { LOW_PCT } from "../attendance-report";
import { ATTENDANCE_DAYS, WELLNESS_DAYS, type TeamReport } from "../team-report";
import { formatValue } from "../validation";

const dm = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;

export async function buildTeamPdf(r: TeamReport, crestDataUrl: string | null): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const H = 297;
  const M = 14;
  const ORANGE: [number, number, number] = [246, 95, 1];
  const BLACK: [number, number, number] = [35, 31, 32];
  const MUTED: [number, number, number] = [96, 90, 85];
  const BAD: [number, number, number] = [185, 28, 28];
  const GOOD: [number, number, number] = [21, 128, 61];
  const BLUE: [number, number, number] = [3, 105, 161];
  const GRID: [number, number, number] = [217, 212, 207];

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
    doc.text(`Estado del equipo · ${r.categoryName} · ${dm(r.today)} · temporada ${r.seasonName}`, M + 25, 22);
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
    ensure(22); // el título nunca queda solo al pie de la página
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
  const line = (t: string, color: [number, number, number] = BLACK, size = 10) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(t, W - 2 * M) as string[];
    ensure(lines.length * 4.8);
    doc.text(lines, M, y);
    y += lines.length * 4.8;
  };

  function attendanceChart(weeks: NonNullable<TeamReport["attendance"]>["weeks"]) {
    if (weeks.length === 0) return;
    const chartH = 32;
    ensure(chartH + 16);
    const top = y + 3;
    const base = top + chartH;
    const left = M + 8;
    const width = W - M - left;
    doc.setDrawColor(...GRID);
    doc.setLineWidth(0.2);
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    for (const v of [0, 50, 100]) {
      const gy = base - (v / 100) * chartH;
      doc.line(left, gy, W - M, gy);
      doc.text(`${v}`, left - 1.5, gy + 1, { align: "right" });
    }
    const slot = width / weeks.length;
    const barW = Math.min(9, (slot * 0.8) / 2);
    weeks.forEach((w, i) => {
      const cx = left + slot * i + slot / 2;
      ([["p", w.practicePct, ORANGE], ["m", w.matchPct, BLUE]] as const).forEach(([, pct, color], j) => {
        if (pct === null) return;
        const h = Math.max(0.6, (pct / 100) * chartH);
        const bx = cx - barW + j * barW;
        doc.setFillColor(...color);
        doc.rect(bx + 0.3, base - h, barW - 0.6, h, "F");
        doc.setFontSize(6.5);
        doc.setTextColor(...(pct < LOW_PCT ? BAD : BLACK));
        doc.text(String(pct), bx + barW / 2, base - h - 1, { align: "center" });
      });
      doc.setFontSize(6.5);
      doc.setTextColor(...MUTED);
      doc.text(`sem. ${dm(w.weekStart)}`, cx, base + 4, { align: "center" });
    });
    // Leyenda
    doc.setFontSize(7.5);
    doc.setFillColor(...ORANGE);
    doc.rect(M, base + 7, 3, 3, "F");
    doc.setTextColor(...MUTED);
    doc.text("Prácticas", M + 4.5, base + 9.5);
    doc.setFillColor(...BLUE);
    doc.rect(M + 22, base + 7, 3, 3, "F");
    doc.text("Partidos", M + 26.5, base + 9.5);
    y = base + 14;
  }

  function lineChart(t: NonNullable<TeamReport["tests"]>[number], x: number, top: number, w: number, h: number) {
    doc.setDrawColor(...GRID);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, top, w, h, 2, 2, "S");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...BLACK);
    doc.text(t.label, x + 3, top + 5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const color = t.improved === true ? GOOD : t.improved === false ? BAD : MUTED;
    doc.setTextColor(...color);
    const last = `${t.value} ${t.unit}${t.change ? ` (${t.change})` : ""}`;
    doc.text(last, x + w - 3, top + 5, { align: "right" });
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text(t.higherIsBetter ? "más es mejor" : "menos es mejor", x + 3, top + 9);
    const pts = t.series;
    const pl = x + 12;
    const pr = x + w - 4;
    const pt = top + 13;
    const pb = top + h - 7;
    if (pts.length === 0) return;
    const vals = pts.map((p) => p.value);
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    if (hi - lo < 1e-9) {
      lo -= Math.abs(lo) * 0.05 || 1;
      hi += Math.abs(hi) * 0.05 || 1;
    }
    const pad = (hi - lo) * 0.15;
    lo -= pad;
    hi += pad;
    const X = (i: number) => (pts.length === 1 ? (pl + pr) / 2 : pl + ((pr - pl) * i) / (pts.length - 1));
    const Y = (v: number) => pb - ((v - lo) / (hi - lo)) * (pb - pt);
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.setDrawColor(...GRID);
    for (const v of [lo + pad, hi - pad]) {
      doc.line(pl, Y(v), pr, Y(v));
      doc.text(formatValue(v, t.decimals), pl - 1.5, Y(v) + 1, { align: "right" });
    }
    doc.setDrawColor(...ORANGE);
    doc.setLineWidth(0.7);
    for (let i = 1; i < pts.length; i++) doc.line(X(i - 1), Y(pts[i - 1].value), X(i), Y(pts[i].value));
    doc.setFillColor(...ORANGE);
    pts.forEach((p, i) => doc.circle(X(i), Y(p.value), 0.9, "F"));
    doc.setTextColor(...MUTED);
    const step = Math.max(1, Math.ceil(pts.length / 6));
    pts.forEach((p, i) => {
      if (i % step === 0 || i === pts.length - 1) doc.text(dm(p.date), X(i), pb + 4, { align: "center" });
    });

  }

  // Números grandes
  const big: [string, string][] = [[String(r.total), "jugadores"]];
  if (r.available !== null) big.push([String(r.available), "disponibles"]);
  if (r.attendance?.pct != null) big.push([`${r.attendance.pct} %`, `asistencia ${ATTENDANCE_DAYS} días`]);
  if (r.wellness?.avg != null) big.push([formatValue(r.wellness.avg, 1), `bienestar /25 (${WELLNESS_DAYS} días)`]);
  big.forEach(([n, l], k) => {
    const x = M + k * 46;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(...BLACK);
    doc.text(n, x, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(l, x, y + 5);
  });
  y += 12;

  if (r.injured) {
    title("Lesionados");
    if (r.injured.length === 0) line("Nadie lesionado.", MUTED);
    for (const x of r.injured) line(`• ${x.name}: ${x.status.toLowerCase()}${x.back ? ` · vuelve aprox. ${dm(x.back)}` : ""}`);
  }
  if (r.alerts) {
    title("Para mirar");
    if (r.alerts.length === 0) line("Sin alertas.", MUTED);
    for (const a of r.alerts) line(`• ${a.label} · ${a.name}: ${a.detail}`, a.severity === "alta" ? BAD : BLACK);
  }
  if (r.attendance) {
    title(`Asistencia (últimos ${ATTENDANCE_DAYS} días)`);
    if (r.attendance.sessions === 0) line("No se tomó asistencia.", MUTED);
    else {
      line(`${r.attendance.pct ?? "—"} % en ${r.attendance.sessions} días · prácticas ${r.attendance.practicePct ?? "—"} % · partidos ${r.attendance.matchPct ?? "—"} %`);
      if (r.attendance.low.length) line(`Menos de ${LOW_PCT} %: ${r.attendance.low.map((x) => `${x.name} (${x.pct} %)`).join(", ")}`, BAD);
      attendanceChart(r.attendance.weeks);
    }
  }
  if (r.tests) {
    title("Tests (promedio del último testeo)");
    if (r.tests.length === 0) line("Sin tests en la temporada.", MUTED);
    // Dos gráficos por fila: evolución del promedio del grupo en la temporada
    const boxW = (W - 2 * M - 6) / 2;
    const boxH = 44;
    r.tests.forEach((t, k) => {
      if (k % 2 === 0) ensure(boxH + 4);
      const x = M + (k % 2) * (boxW + 6);
      lineChart(t, x, y, boxW, boxH);
      if (k % 2 === 1 || k === r.tests!.length - 1) y += boxH + 5;
    });
  }
  if (r.wellness) {
    title(`Bienestar (últimos ${WELLNESS_DAYS} días)`);
    line(r.wellness.avg === null ? "Sin registros." : `${formatValue(r.wellness.avg, 1)} /25 de promedio · ${r.wellness.logs} registros de ${r.wellness.players} jugadores`);
  }
  if (r.noConsent) {
    y += 2;
    line(`${r.noConsent} ${r.noConsent === 1 ? "jugador" : "jugadores"} sin consentimiento de datos de rendimiento.`, MUTED, 9);
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text("Uso interno del cuerpo técnico. Contiene datos de menores: no reenviar fuera del staff.", M, H - 8);
    doc.text(`${p}/${pages}`, W - M, H - 8, { align: "right" });
  }
  return doc.output("blob");
}
