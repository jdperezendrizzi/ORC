"use client";

import { useState } from "react";
import type { AttendanceReport } from "@/lib/attendance-report";
import { buildAttendancePdf } from "@/lib/report/attendance-pdf";
import { logAttendanceExport } from "./actions";
import { crestDataUrl, downloadBlob, shareOrDownload } from "@/lib/download";

export interface DetailRow {
  date: string;
  kind: string;
  player: string;
  status: string;
}

/** Excel, PDF y texto para WhatsApp del resumen de asistencia. */
export function AttendanceExport({
  report,
  detail,
  text,
  insights,
  categoryId,
  categoryName,
  periodLabel,
  seasonName,
}: {
  report: AttendanceReport;
  detail: DetailRow[];
  text: string;
  insights: string[];
  categoryId: string;
  categoryName: string;
  periodLabel: string;
  seasonName: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const base = `Asistencia ${categoryName} - ${periodLabel}`;

  async function run(format: "xlsx" | "pdf" | "text", save = false) {
    setBusy(save ? "download" : format);
    setMsg({});
    const auth = await logAttendanceExport(categoryId, report.from, report.to, format);
    if ("error" in auth) {
      setBusy(null);
      return setMsg({ error: auth.error });
    }
    try {
      if (format === "xlsx") {
        const { default: writeExcelFile } = await import("write-excel-file/browser");
        const h = (v: string) => ({ value: v, fontWeight: "bold" as const });
        const resumen = [
          [h("Jugador"), h("Presentes"), h("Ausentes"), h("Justificadas"), h("Prácticas %"), h("Partidos %"), h("Total %")],
          ...report.players.map((p) => [
            { value: p.name },
            { value: p.present, type: Number },
            { value: p.absent, type: Number },
            { value: p.excused, type: Number },
            p.practicePct === null ? null : { value: p.practicePct, type: Number },
            p.matchPct === null ? null : { value: p.matchPct, type: Number },
            p.pct === null ? null : { value: p.pct, type: Number },
          ]),
          [],
          [
            { value: "Promedio del equipo" },
            null,
            null,
            null,
            report.practicePct === null ? null : { value: report.practicePct, type: Number },
            report.matchPct === null ? null : { value: report.matchPct, type: Number },
            report.avgPct === null ? null : { value: report.avgPct, type: Number },
          ],
          [{ value: `Prácticas: ${report.practices} · Partidos: ${report.matches}` }],
        ];
        const detalle = [
          [h("Fecha"), h("Tipo"), h("Jugador"), h("Estado")],
          ...detail.map((d) => [{ value: d.date }, { value: d.kind }, { value: d.player }, { value: d.status }]),
        ];
        await writeExcelFile([
          {
            data: resumen,
            sheet: "Resumen",
            columns: [{ width: 28 }, { width: 11 }, { width: 11 }, { width: 13 }, { width: 12 }, { width: 12 }, { width: 10 }],
            stickyRowsCount: 1,
          },
          { data: detalle, sheet: "Detalle", columns: [{ width: 12 }, { width: 10 }, { width: 28 }, { width: 13 }], stickyRowsCount: 1 },
        ] as never).toFile(`${base}.xlsx`);
        setMsg({ ok: "Excel descargado." });
      } else if (format === "pdf") {
        const blob = await buildAttendancePdf(report, { categoryName, periodLabel, seasonName, insights }, await crestDataUrl());
        const file = new File([blob], `${base}.pdf`, { type: "application/pdf" });
        if (save) {
          downloadBlob(blob, file.name);
          return setMsg({ ok: "PDF descargado." });
        }
        const r = await shareOrDownload(file, base);
        if (r !== "cancelled") setMsg({ ok: r === "shared" ? "PDF listo para compartir." : "PDF descargado." });
      } else {
        try {
          if (navigator.share) {
            await navigator.share({ text });
            return setMsg({ ok: "Listo para compartir." });
          }
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") return;
        }
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
      }
    } catch (e) {
      setMsg({ error: `No se pudo generar el archivo: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card space-y-3" aria-label="Exportar y compartir">
      <h2 className="font-bold">Sacarlo de la app</h2>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary h-10" disabled={!!busy} onClick={() => void run("text")}>
          {busy === "text" ? "Preparando…" : "Compartir por WhatsApp"}
        </button>
        <button type="button" className="btn-ghost h-10" disabled={!!busy} onClick={() => void run("xlsx")}>
          {busy === "xlsx" ? "Generando…" : "Descargar Excel"}
        </button>
        <button type="button" className="btn-ghost h-10" disabled={!!busy} onClick={() => void run("pdf")}>
          {busy === "pdf" ? "Generando…" : "Compartir PDF"}
        </button>
        <button type="button" className="btn-ghost h-10" disabled={!!busy} onClick={() => void run("pdf", true)}>
          {busy === "download" ? "Generando…" : "Descargar PDF"}
        </button>
      </div>
      {msg.ok && <p className="chip tone-green px-3 py-1 text-sm">{msg.ok}</p>}
      {msg.error && (
        <p role="alert" className="chip tone-red px-3 py-1 text-sm">
          {msg.error}
        </p>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold text-orc-orange-strong">Ver el texto que se comparte</summary>
        <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-orc-chip p-3 font-sans text-sm">{text}</pre>
      </details>
      <p className="text-xs text-orc-muted">Lleva nombres de jugadores: es para el cuerpo técnico. Cada exportación queda registrada.</p>
    </section>
  );
}
