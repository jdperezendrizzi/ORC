// Informe de rendimiento del jugador en PDF (para compartir con la familia).
// Contenido: SÓLO rendimiento (decisión del club). Sin antropometría,
// bienestar, lesiones ni datos personales.

import { METRIC_INFO, DOMAIN_INFO } from "../glossary";
import { domainLabel, formatDate } from "../labels";
import { formatValue } from "../validation";

export const REPORT_DOMAINS = ["strength", "speed", "power", "agility", "endurance", "rugby"] as const;

export interface ReportMetric {
  code: string;
  name: string;
  unit: string;
  decimals: number;
  higherIsBetter: boolean;
  domain: string;
  series: { date: string; value: number; z: number | null }[];
}

export interface ReportData {
  playerName: string;
  subtitle: string; // "Menores de 17 · Segundo centro · 17 años"
  seasonName: string;
  issuedBy: string;
  issuedOn: string; // YYYY-MM-DD
  minor: boolean;
  metrics: ReportMetric[];
}

/** Lectura en palabras de la comparación (z > 0 = mejor). */
export function zText(z: number | null): string {
  if (z === null || Number.isNaN(z)) return "Sin comparación (pocos datos)";
  if (z >= 1) return "Muy por encima del promedio";
  if (z >= 0.5) return "Por encima del promedio";
  if (z > -0.5) return "En el promedio";
  if (z > -1) return "Por debajo del promedio";
  return "Bastante por debajo del promedio";
}

/** Sólo dominios de rendimiento y métricas con datos. */
export function reportMetrics(all: ReportMetric[]): ReportMetric[] {
  return all.filter((m) => (REPORT_DOMAINS as readonly string[]).includes(m.domain) && m.series.length > 0);
}

const pdfText = (s: string) => s.replace(/₂/g, "2").replace(/[▲▼]/g, "");

export async function buildPlayerReportPdf(data: ReportData, crestDataUrl: string | null): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const M = 14; // margen
  const ORANGE: [number, number, number] = [241, 136, 42];
  const ORANGE_TEXT: [number, number, number] = [181, 87, 12];
  const BLACK: [number, number, number] = [35, 31, 32];
  const MUTED: [number, number, number] = [96, 90, 85];
  const GOOD: [number, number, number] = [21, 128, 61];
  const BAD: [number, number, number] = [185, 28, 28];

  // ---- Encabezado ----
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
  doc.text("Informe de rendimiento", M + 25, 22);
  doc.text(`Temporada ${data.seasonName}`, W - M, 22, { align: "right" });

  // ---- Jugador ----
  let y = 44;
  doc.setTextColor(...BLACK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.text(pdfText(data.playerName), M, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(...MUTED);
  doc.text(pdfText(data.subtitle), M, y);
  y += 5.5;
  doc.setFontSize(9);
  doc.text(
    `Emitido el ${formatDate(data.issuedOn, { day: "numeric", month: "long", year: "numeric" })} por ${pdfText(data.issuedBy)}`,
    M,
    y,
  );
  y += 9;
  doc.setFontSize(9.5);
  doc.setTextColor(...BLACK);
  const intro = doc.splitTextToSize(
    "Resumen de las últimas evaluaciones físicas. Para cada prueba se muestra el último resultado, cuánto cambió respecto de la medición anterior y cómo está comparado con el promedio de su categoría en la temporada.",
    W - 2 * M,
  );
  doc.text(intro, M, y);
  y += intro.length * 4.3 + 4;

  const ensure = (h: number) => {
    if (y + h > 280) {
      doc.addPage();
      y = 20;
    }
  };

  // ---- Columnas ----
  const X = { name: M, value: 86, date: 112, delta: 132, comp: 160 };
  const tableHeader = () => {
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "bold");
    doc.text("PRUEBA", X.name, y);
    doc.text("ÚLTIMO", X.value, y);
    doc.text("FECHA", X.date, y);
    doc.text("CAMBIO", X.delta, y);
    doc.text("VS. SU CATEGORÍA", X.comp, y);
    y += 2;
    doc.setDrawColor(217, 212, 207);
    doc.line(M, y, W - M, y);
    y += 5;
  };

  const metrics = reportMetrics(data.metrics);
  for (const domain of REPORT_DOMAINS) {
    const items = metrics.filter((m) => m.domain === domain);
    if (items.length === 0) continue;
    ensure(26);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...ORANGE_TEXT);
    doc.text((domainLabel[domain] ?? domain).toUpperCase(), M, y);
    y += 4.5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(pdfText(DOMAIN_INFO[domain] ?? ""), M, y);
    y += 6;
    tableHeader();

    for (const m of items) {
      const last = m.series[m.series.length - 1];
      const prev = m.series.length > 1 ? m.series[m.series.length - 2] : null;
      const what = doc.splitTextToSize(pdfText(METRIC_INFO[m.code]?.what ?? ""), X.value - X.name - 4).slice(0, 2);
      const rowH = 5 + what.length * 3.4 + 3;
      ensure(rowH + 2);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...BLACK);
      doc.text(pdfText(m.name), X.name, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...MUTED);
      doc.text(what, X.name, y + 3.8);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...BLACK);
      const unit = m.unit === "n" ? "" : ` ${pdfText(m.unit)}`;
      doc.text(`${formatValue(last.value, m.decimals)}${unit}`, X.value, y);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...MUTED);
      doc.text(formatDate(last.date, { day: "2-digit", month: "2-digit", year: "2-digit" }), X.date, y);

      if (prev) {
        const delta = last.value - prev.value;
        if (delta === 0) {
          doc.text("Igual", X.delta, y);
        } else {
          const better = delta > 0 === m.higherIsBetter;
          doc.setTextColor(...(better ? GOOD : BAD));
          doc.setFont("helvetica", "bold");
          doc.text(`${better ? "Mejoró" : "Bajó"} ${formatValue(Math.abs(delta), m.decimals)}`, X.delta, y);
          doc.setFont("helvetica", "normal");
        }
      } else {
        doc.text("Primera vez", X.delta, y);
      }

      // Barra de comparación
      const bx = X.comp;
      const bw = W - M - bx;
      const by = y - 2.2;
      doc.setFillColor(233, 229, 225);
      doc.roundedRect(bx, by, bw, 2.2, 1.1, 1.1, "F");
      doc.setDrawColor(150, 143, 137);
      doc.line(bx + bw / 2, by - 1, bx + bw / 2, by + 3.2);
      if (last.z !== null) {
        const c = Math.max(-2, Math.min(2, last.z));
        doc.setFillColor(...(c >= 0.5 ? GOOD : c <= -0.5 ? BAD : BLACK));
        doc.circle(bx + ((c + 2) / 4) * bw, by + 1.1, 1.6, "F");
      }
      doc.setFontSize(7.5);
      doc.setTextColor(...MUTED);
      doc.text(zText(last.z), bx, y + 4);

      y += rowH;
      doc.setDrawColor(235, 231, 227);
      doc.line(M, y - 2, W - M, y - 2);
      y += 1.5;
    }
    y += 3;
  }

  if (metrics.length === 0) {
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text("Todavía no hay evaluaciones de rendimiento cargadas.", M, y);
  }

  // ---- Cómo leerlo ----
  ensure(22);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...BLACK);
  doc.text("Cómo leer este informe", M, y);
  y += 4.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  const how = doc.splitTextToSize(
    "«Mejoró» / «Bajó» compara con la medición anterior del mismo jugador. En pruebas de tiempo (sprint, agilidad) mejorar es bajar el tiempo. «Vs. su categoría» ubica el último resultado respecto del promedio de los compañeros de su categoría: el punto a la derecha de la línea central es mejor que el promedio. En chicos en crecimiento las diferencias de maduración influyen mucho: lo más importante es su propia evolución.",
    W - 2 * M,
  );
  doc.text(how, M, y);

  // ---- Pie en todas las páginas ----
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(217, 212, 207);
    doc.line(M, 286, W - M, 286);
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(
      data.minor
        ? "Documento confidencial del club. Contiene datos de un menor: no reenviar ni publicar."
        : "Documento confidencial del club. No reenviar ni publicar.",
      M,
      290.5,
    );
    doc.text(`Página ${i} de ${pages}`, W - M, 290.5, { align: "right" });
  }

  return doc.output("blob");
}
