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
    ensure(14);
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
    }
  }
  if (r.tests) {
    title("Tests (promedio del último testeo)");
    if (r.tests.length === 0) line("Sin tests en la temporada.", MUTED);
    for (const t of r.tests) {
      const ch = t.change ? ` · ${t.change} vs. el anterior` : "";
      line(`• ${t.label}: ${t.value} ${t.unit}${ch} (${t.n} jugadores${t.date ? `, ${dm(t.date)}` : ""})`, t.improved === true ? GOOD : t.improved === false ? BAD : BLACK);
    }
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
