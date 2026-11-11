"use client";

import { useState } from "react";
import { buildTeamPdf } from "@/lib/report/team-pdf";
import type { TeamReport } from "@/lib/team-report";
import { logTeamReport } from "./actions";

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

export function TeamShare({ report, text, categoryId, canShare }: { report: TeamReport; text: string; categoryId: string; canShare: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const base = `Estado del equipo ${report.categoryName} ${report.today}`;

  async function run(format: "pdf" | "text") {
    setBusy(format);
    setMsg({});
    const auth = await logTeamReport(categoryId, format);
    if ("error" in auth) {
      setBusy(null);
      return setMsg({ error: auth.error });
    }
    try {
      if (format === "pdf") {
        const blob = await buildTeamPdf(report, await crestDataUrl());
        const file = new File([blob], `${base}.pdf`, { type: "application/pdf" });
        try {
          if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], title: base });
            return setMsg({ ok: "PDF listo para compartir." });
          }
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        setMsg({ ok: "PDF descargado." });
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
        setMsg({ ok: "Se abrió WhatsApp." });
      }
    } catch (e) {
      setMsg({ error: `No se pudo generar: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card space-y-3" aria-label="Compartir">
      <h2 className="font-bold">Compartir</h2>
      {canShare ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary h-11" disabled={!!busy} onClick={() => void run("text")}>
            {busy === "text" ? "Preparando…" : "Compartir por WhatsApp"}
          </button>
          <button type="button" className="btn-ghost h-11" disabled={!!busy} onClick={() => void run("pdf")}>
            {busy === "pdf" ? "Generando…" : "PDF"}
          </button>
        </div>
      ) : (
        <p className="text-sm text-orc-muted">No tenés habilitado compartir. Pedíselo al admin.</p>
      )}
      {msg.ok && <p className="chip tone-green px-3 py-1 text-sm">✓ {msg.ok}</p>}
      {msg.error && (
        <p role="alert" className="chip tone-red px-3 py-1 text-sm">
          ⛔ {msg.error}
        </p>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold text-orc-orange-strong">Ver el texto que se comparte</summary>
        <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-orc-chip p-3 font-sans text-sm">{text}</pre>
      </details>
      <p className="text-xs text-orc-muted">Lleva nombres de jugadores: es para el cuerpo técnico. Cada vez que se comparte queda registrado.</p>
    </section>
  );
}
