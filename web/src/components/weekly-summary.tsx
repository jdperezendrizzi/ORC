"use client";

import { downloadBlob } from "@/lib/download";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult, FormAction } from "./action-form";
import { Message } from "./action-form";

export interface WeeklySummaryView {
  text: string; // ya con nombres
  periodLabel: string;
  generatedLabel: string;
  byAi: boolean;
}

/** Resumen de la semana: lo redacta la IA a partir de los números (o una plantilla). */
export function WeeklySummaryCard({
  categoryId,
  categoryName,
  summary,
  action,
  aiEnabled,
  canGenerate = true,
}: {
  categoryId: string;
  categoryName: string;
  summary: WeeklySummaryView | null;
  action: FormAction;
  aiEnabled: boolean;
  canGenerate?: boolean;
}) {
  const [state, formAction] = useActionState(action, {} as ActionResult);
  const [copied, setCopied] = useState(false);

  const shareText = summary
    ? `Resumen semanal ORC · ${categoryName} (${summary.periodLabel})\n\n${summary.text}\n\n— Uso interno del cuerpo técnico.`
    : "";

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ text: shareText });
        return;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank", "noopener");
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* sin permiso de portapapeles */
    }
  }

  return (
    <section className="card space-y-3" aria-label="Resumen de la semana">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-bold">Resumen de la semana</h2>
          {summary && <p className="text-xs text-orc-muted">{summary.periodLabel} · {summary.generatedLabel}</p>}
        </div>
        {summary && (
          <span className={`chip text-xs ${summary.byAi ? "tone-green" : ""}`}>{summary.byAi ? "Redactado con IA" : "Automático"}</span>
        )}
      </div>

      {summary ? (
        <p className="whitespace-pre-line text-sm leading-relaxed">{summary.text}</p>
      ) : (
        <p className="text-sm text-orc-muted">
          Todavía no se generó el resumen de esta semana. Junta bienestar, carga, evaluaciones, mejoras, lesiones y alertas
          de los últimos 7 días.
        </p>
      )}

      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="category_id" value={categoryId} />
        {canGenerate && <GenerateButton label={summary ? "Actualizar" : "Generar resumen"} />}
        {summary && (
          <>
            <button type="button" className="btn-ghost h-10" onClick={() => void share()}>
              Compartir
            </button>
            <button type="button" className="btn-ghost h-10" onClick={() => void copy()}>
              {copied ? "¡Copiado!" : "Copiar"}
            </button>
            <button
              type="button"
              className="btn-ghost h-10"
              onClick={() =>
                downloadBlob(new Blob([shareText], { type: "text/plain;charset=utf-8" }), `Resumen semanal ${categoryName} - ${summary.periodLabel}.txt`)
              }
            >
              Descargar
            </button>
          </>
        )}
        <Message state={state} />
      </form>

      <p className="text-xs text-orc-muted">
        {aiEnabled
          ? "La IA (Groq, plan gratuito) recibe sólo números y códigos (J1, J2…), nunca nombres: los nombres se ponen acá, en la app. Revisalo antes de compartir: puede equivocarse."
          : "Sin IA configurada: el resumen se arma con una plantilla automática con los mismos datos."}{" "}
        Es para el cuerpo técnico: no lo compartas con familias ni en grupos abiertos.
      </p>
    </section>
  );
}

function GenerateButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary h-10">
      {pending ? "Generando…" : label}
    </button>
  );
}
