"use client";

import { useState } from "react";
import { authorizeReport, exportCategory } from "@/app/(app)/share-actions";
import { buildPlayerReportPdf, type ReportData } from "@/lib/report/player-report";

async function crestDataUrl(): Promise<string | null> {
  try {
    const blob = await (await fetch("/crest.png")).blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const shareIcon = (
  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
  </svg>
);

/**
 * Comparte el informe de rendimiento en PDF. En el celular abre el menú de
 * compartir del sistema (WhatsApp, mail…); en la compu lo descarga.
 */
export function ShareReportButton({
  playerId,
  data,
  blockedReason,
}: {
  playerId: string;
  data: ReportData;
  blockedReason: string | null;
}) {
  const [state, setState] = useState<{ busy: boolean; msg?: string; error?: string }>({ busy: false });
  // Safari exige que share() salga directo de un toque: si se venció mientras se
  // generaba el PDF, se ofrece un segundo botón con el archivo ya listo.
  const [ready, setReady] = useState<File | null>(null);

  async function shareFile(file: File) {
    await navigator.share({
      files: [file],
      title: `Informe de rendimiento · ${data.playerName}`,
      text: `Informe de rendimiento de ${data.playerName} (ORC, temporada ${data.seasonName}).`,
    });
  }

  async function run(save = false) {
    setReady(null);
    setState({ busy: true });
    const auth = await authorizeReport(playerId);
    if ("error" in auth) return setState({ busy: false, error: auth.error });
    const blob = await buildPlayerReportPdf(data, await crestDataUrl());
    const fileName = `Informe ORC - ${data.playerName}.pdf`;
    const file = new File([blob], fileName, { type: "application/pdf" });
    if (save) {
      download(blob, fileName);
      return setState({ busy: false, msg: "PDF descargado." });
    }
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await shareFile(file);
        return setState({ busy: false, msg: "Informe listo para compartir." });
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return setState({ busy: false }); // canceló
      if (e instanceof DOMException && e.name === "NotAllowedError") {
        setReady(file);
        return setState({ busy: false, msg: "El informe está listo." });
      }
    }
    download(blob, fileName);
    setState({ busy: false, msg: "PDF descargado. Podés adjuntarlo en WhatsApp." });
  }

  if (blockedReason) {
    return (
      <p className="flex items-start gap-2 rounded-lg bg-white/10 px-3 py-2 text-xs text-white/80">
        <span className="mt-0.5 shrink-0">{shareIcon}</span>
        <span>{blockedReason}</span>
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={() => void run()} disabled={state.busy} className="btn-primary h-10">
        {shareIcon}
        {state.busy ? "Generando…" : "Compartir informe (PDF)"}
      </button>
      <button
        type="button"
        onClick={() => void run(true)}
        disabled={state.busy}
        className="btn-ghost h-10 border-white/30 bg-transparent text-white hover:bg-white/10"
      >
        Descargar PDF
      </button>
      {ready && (
        <button
          type="button"
          className="btn-dark h-10"
          onClick={() =>
            void shareFile(ready)
              .then(() => setReady(null))
              .catch(() => {
                download(ready, ready.name);
                setReady(null);
              })
          }
        >
          Enviar (WhatsApp…)
        </button>
      )}
      {state.msg && <span className="text-xs text-white/80">{state.msg}</span>}
      {state.error && <span className="text-xs font-semibold text-red-300">{state.error}</span>}
    </div>
  );
}

/** Exporta la categoría a Excel (uso interno del staff). */
export function ExportCategoryButton({ categoryId }: { categoryId: string }) {
  const [state, setState] = useState<{ busy: boolean; error?: string }>({ busy: false });
  async function run() {
    setState({ busy: true });
    const res = await exportCategory(categoryId);
    if ("error" in res) return setState({ busy: false, error: res.error });
    const { default: writeExcelFile } = await import("write-excel-file/browser");
    const { headers, rows, fileName } = res.ok;
    await writeExcelFile([headers, ...rows], {
      columns: headers.map((h, i) => ({ width: i < 2 ? 18 : Math.max(10, Math.min(28, h.length + 2)) })),
    }).toFile(fileName);
    setState({ busy: false });
  }
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button type="button" onClick={() => void run()} disabled={state.busy} className="btn-ghost">
        {state.busy ? "Generando…" : "Exportar Excel"}
      </button>
      {state.error && <span className="text-xs text-bad">{state.error}</span>}
    </span>
  );
}
