"use client";

import { useState } from "react";
import { formatDate } from "@/lib/labels";
import type { ObjectivesReport } from "@/lib/objectives-report";
import { objectivesReportText } from "@/lib/objectives-report";
import { buildObjectivesPdf } from "@/lib/report/objectives-pdf";
import { logObjectivesReport } from "@/app/(app)/objetivos/actions";

const SEG = [
  { k: "achieved", label: "Logrados", cls: "bg-orc-orange" },
  { k: "in_progress", label: "En progreso", cls: "bg-amber-400" },
  { k: "not_yet", label: "Todavía no", cls: "bg-zinc-500" },
  { k: "unmarked", label: "Sin marcar", cls: "bg-orc-chip" },
] as const;

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

/** Resumen de la temporada: gráficos + compartir (WhatsApp / PDF). */
export function ObjectivesSummary({ report, categoryId, canShare }: { report: ObjectivesReport; categoryId: string; canShare: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const text = objectivesReportText(report);
  const base = `Objetivos ${report.categoryName} ${report.today}`;

  async function run(format: "pdf" | "text") {
    setBusy(format);
    setMsg({});
    if (!navigator.onLine) {
      setBusy(null);
      return setMsg({ error: "Para compartir hace falta señal." });
    }
    const auth = await logObjectivesReport(categoryId, format);
    if ("error" in auth) {
      setBusy(null);
      return setMsg({ error: auth.error });
    }
    try {
      if (format === "pdf") {
        const blob = await buildObjectivesPdf(report, await crestDataUrl());
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
    <section id="resumen" className="card space-y-4 scroll-mt-20" aria-label="Resumen de la temporada">
      <h2 className="text-lg font-bold">Resumen de la temporada</h2>

      <div className="space-y-2" aria-label="Por área">
        <h3 className="text-sm font-bold uppercase tracking-wide text-orc-muted">Por área</h3>
        {report.byArea.map((a) => (
          <div key={a.area} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-2 text-sm">
            <span className="truncate font-semibold">{a.label}</span>
            <div className="flex h-3.5 overflow-hidden rounded-full bg-orc-chip" role="img" aria-label={`${a.label}: ${a.counts.achieved} logrados, ${a.counts.in_progress} en progreso, ${a.counts.not_yet} todavía no, de ${a.total}`}>
              {SEG.map((s) => (
                <div key={s.k} className={`h-full ${s.cls}`} style={{ width: `${a.total ? (a.counts[s.k] / a.total) * 100 : 0}%` }} />
              ))}
            </div>
            <span className="text-xs tabular-nums text-orc-muted">
              {a.counts.achieved}/{a.total}
            </span>
          </div>
        ))}
        <p className="flex flex-wrap gap-3 text-xs">
          {SEG.map((s) => (
            <span key={s.k} className="flex items-center gap-1.5">
              <span className={`inline-block size-3 rounded-sm ${s.cls}`} aria-hidden /> {s.label}
            </span>
          ))}
        </p>
      </div>

      {report.timeline.length >= 2 && <Evolution report={report} />}

      <div className="space-y-2 border-t border-orc-line pt-3">
        <h3 className="font-bold">Compartir</h3>
        {canShare ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary h-11" disabled={!!busy} onClick={() => void run("pdf")}>
              {busy === "pdf" ? "Generando…" : "PDF con gráficos"}
            </button>
            <button type="button" className="btn-ghost h-11" disabled={!!busy} onClick={() => void run("text")}>
              {busy === "text" ? "Preparando…" : "Compartir por WhatsApp"}
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
        <p className="text-xs text-orc-muted">Es para el cuerpo técnico. Cada vez que se comparte queda registrado.</p>
      </div>
    </section>
  );
}

/** Evolución: cuántos logrados / en progreso al cierre de cada semana. */
function Evolution({ report }: { report: ObjectivesReport }) {
  const t = report.timeline;
  const max = Math.max(1, report.total);
  const Wv = 320;
  const Hv = 130;
  const L = 22;
  const R = 6;
  const T = 8;
  const B = 18;
  const X = (i: number) => L + ((Wv - L - R) * i) / (t.length - 1);
  const Y = (v: number) => T + (Hv - T - B) * (1 - v / max);
  const path = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  const step = Math.max(1, Math.ceil(t.length / 6));
  return (
    <figure className="space-y-1" aria-label="Evolución de la temporada">
      <h3 className="text-sm font-bold uppercase tracking-wide text-orc-muted">Evolución de la temporada</h3>
      <svg viewBox={`0 0 ${Wv} ${Hv}`} className="h-auto w-full" role="img" aria-label={`Al ${formatDate(t[t.length - 1].week)}: ${t[t.length - 1].achieved} logrados y ${t[t.length - 1].inProgress} en progreso`}>
        {[0, Math.round(max / 2), max].map((v) => (
          <g key={v}>
            <line x1={L} x2={Wv - R} y1={Y(v)} y2={Y(v)} className="stroke-orc-line" strokeWidth={0.6} />
            <text x={L - 4} y={Y(v) + 3} textAnchor="end" className="fill-orc-muted" fontSize={8}>
              {v}
            </text>
          </g>
        ))}
        <path d={path(t.map((x) => x.inProgress))} fill="none" stroke="#fbbf24" strokeWidth={2} />
        <path d={path(t.map((x) => x.achieved))} fill="none" stroke="var(--color-orc-orange)" strokeWidth={2.4} />
        {t.map((x, i) =>
          i % step === 0 || i === t.length - 1 ? (
            <text key={x.week} x={X(i)} y={Hv - 4} textAnchor="middle" className="fill-orc-muted" fontSize={8}>
              {formatDate(x.week)}
            </text>
          ) : null,
        )}
      </svg>
      <figcaption className="flex flex-wrap gap-3 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-1 w-4 rounded bg-orc-orange" aria-hidden /> Logrados
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-1 w-4 rounded bg-amber-400" aria-hidden /> En progreso
        </span>
        <span className="text-orc-muted">al cierre de cada semana</span>
      </figcaption>
    </figure>
  );
}
