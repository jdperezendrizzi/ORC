import type { Metadata } from "next";
import { canEdit, canView } from "@/lib/modules";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { getViewer, getViewerCategories, isStaff } from "@/lib/server-data";
import { loadPlayerSheet, type Review, type SheetMetric } from "@/lib/promotion-server";
import { aboveMedianCount, outcomeLabel, outcomeTone, standingLabel, standingTone, type Outcome } from "@/lib/promotion";
import { formatDate } from "@/lib/labels";
import { formatValue } from "@/lib/validation";
import { saveDecision, saveRecommendation } from "./actions";

export const metadata: Metadata = { title: "Evaluación de pase" };
export const dynamic = "force-dynamic";

const OUTCOMES: Outcome[] = ["promote", "observe", "stay"];
const unitLabel = { forwards: "forwards", backs: "backs" } as const;

export default async function PromotionSheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ref?: string }>;
}) {
  const { id } = await params;
  const { ref } = await searchParams;
  const { supabase, season, profile, modules } = await getViewer();
  if (!season || !isStaff(profile) || !canView(modules, "promotion")) notFound();
  const sheet = await loadPlayerSheet(supabase, season, id, ref);
  if (!sheet) notFound();

  const isAdmin = profile!.role === "admin";
  const canRecommend = canEdit(modules, "promotion") && (isAdmin || (profile!.role === "coach" && (await getViewerCategories()).some((c) => c.id === sheet.category.id)));
  const s = sheet;
  const tests = aboveMedianCount(s.metrics.map((m) => m.standing));
  const refName = s.target ? `${s.target.name}${s.unit ? ` (${unitLabel[s.unit]})` : ""}` : "—";

  return (
    <div className="space-y-5">
      <a href={`/jugadores/${id}`} className="text-sm text-orc-muted">
        ← Perfil
      </a>
      <header className="space-y-2">
        <p className="text-sm text-orc-muted">Evaluación de pase · temporada {season.name}</p>
        <h1 className="text-2xl font-black">
          {s.player.last_name}, {s.player.first_name}
        </h1>
        <p className="text-sm">
          {s.category.name}
          {s.target ? ` → ${s.target.name}` : " · última categoría"}
        </p>
        {s.targetOptions.length > 1 && (
          <form method="get" className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="label">Comparar con</span>
              <select name="ref" defaultValue={s.target?.id} className="field-input">
                {s.targetOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn-ghost h-11">
              Ver
            </button>
          </form>
        )}
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Resumen">
        <Stat label="Asistencia" value={s.attendance.pct === null ? "—" : `${s.attendance.pct}%`} sub={`${s.attendance.present} pres. · ${s.attendance.absent} aus. · ${s.attendance.excused} just.`} />
        <Stat label="Objetivos de la categoría" value={s.objectives ? `${s.objectives.done}/${s.objectives.total}` : "—"} sub={s.objectives ? "logrados por el equipo" : "sin objetivos cargados"} />
        <Stat label={`Tests vs. ${s.target?.name ?? "—"}`} value={tests.total ? `${tests.above}/${tests.total}` : "—"} sub="en la mediana o mejor" />
        <Stat
          label="Disponibilidad"
          value={s.injuries.count === 0 ? "Sin lesiones" : `${s.injuries.daysOut} días fuera`}
          sub={s.injuries.count ? `${s.injuries.count} ${s.injuries.count === 1 ? "lesión" : "lesiones"} en la temporada${s.injuries.active ? " · una activa" : ""}` : "en la temporada"}
        />
      </section>

      <section className="card space-y-3">
        <div>
          <h2 className="font-bold">Físico vs. {refName}</h2>
          <p className="text-sm text-orc-muted">
            Su mejor marca de la temporada contra los jugadores de {s.target?.name ?? "la categoría siguiente"} medidos este año (sólo
            datos agregados; hacen falta al menos 3). <b>Rango típico</b>: la mitad del medio (del 25 % al 75 %).
          </p>
        </div>
        {!canView(modules, "performance") ? (
          <p className="text-sm text-orc-muted">No tenés habilitado el módulo de rendimiento.</p>
        ) : !s.hasPerfConsent ? (
          <p className="rounded-lg tone-amber px-3 py-2 text-sm">Sin consentimiento de datos de rendimiento: no hay datos físicos.</p>
        ) : s.metrics.length === 0 ? (
          <p className="text-sm text-orc-muted">Todavía no tiene tests físicos esta temporada.</p>
        ) : (
          <ul className="divide-y divide-orc-line">
            {s.metrics.map((m) => (
              <MetricRow key={m.id} m={m} />
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <ReviewCard
          title="Recomendación del profe"
          kind="recommendation"
          review={s.review}
          canEdit={canRecommend}
          hidden={{ player_id: s.player.id, from_category_id: s.category.id, target_category_id: s.target?.id ?? "" }}
        />
        <ReviewCard
          title="Decisión del coordinador"
          kind="decision"
          review={s.review}
          canEdit={isAdmin}
          hidden={{ player_id: s.player.id, from_category_id: s.category.id, target_category_id: s.target?.id ?? "" }}
        />
      </section>
      <p className="text-xs text-orc-muted">
        La decisión queda registrada; el cambio de categoría se aplica al armar la temporada siguiente.
      </p>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card p-3">
      <p className="text-xs text-orc-muted">{label}</p>
      <p className="text-xl font-black tabular-nums">{value}</p>
      <p className="text-xs text-orc-muted">{sub}</p>
    </div>
  );
}

function MetricRow({ m }: { m: SheetMetric }) {
  const f = (v: number | null) => (v === null ? "—" : formatValue(v, m.decimals));
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{m.name}</span>
        <span className="text-xs text-orc-muted">
          Mejor: <b className="text-orc-ink">{f(m.best)} {m.unit}</b>
          {m.bench && (
            <>
              {" "}
              · referencia: mediana {f(m.bench.p50)}, rango típico {f(Math.min(m.bench.p25, m.bench.p75))}–{f(Math.max(m.bench.p25, m.bench.p75))} (n={m.bench.n}
              {m.benchGroup === "category" ? ", toda la categoría" : ""})
            </>
          )}
          {m.improvement !== null && (
            <>
              {" "}
              · en la temporada {m.improvement >= 0 ? "mejoró" : "bajó"} {formatValue(Math.abs(m.improvement), 1)} %
            </>
          )}
        </span>
      </span>
      {m.standing ? (
        <span className={`chip shrink-0 text-xs ${standingTone[m.standing]}`}>{standingLabel[m.standing]}</span>
      ) : (
        <span className="chip shrink-0 text-xs">Sin referencia</span>
      )}
    </li>
  );
}

function ReviewCard({
  title,
  kind,
  review,
  canEdit,
  hidden,
}: {
  title: string;
  kind: "recommendation" | "decision";
  review: Review | null;
  canEdit: boolean;
  hidden: Record<string, string>;
}) {
  const value = kind === "recommendation" ? review?.recommendation : review?.decision;
  const note = kind === "recommendation" ? review?.recommendation_note : review?.decision_note;
  const at = kind === "recommendation" ? review?.recommended_at : review?.decided_at;
  const who = kind === "recommendation" ? review?.recommender?.full_name : review?.decider?.full_name;
  const action = kind === "recommendation" ? saveRecommendation : saveDecision;
  return (
    <section className="card space-y-3" aria-label={title}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="font-bold">{title}</h2>
        {value ? <span className={`chip ${outcomeTone[value]}`}>{outcomeLabel[value]}</span> : <span className="chip">Pendiente</span>}
      </div>
      {note && <p className="whitespace-pre-line text-sm">{note}</p>}
      {at && (
        <p className="text-xs text-orc-muted">
          {who ?? "—"} · {formatDate(at.slice(0, 10), { day: "numeric", month: "short", year: "numeric" })}
        </p>
      )}
      {canEdit && (
        <ActionForm action={action} submitLabel={value ? "Actualizar" : "Guardar"}>
          {Object.entries(hidden).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <fieldset>
            <legend className="sr-only">{title}</legend>
            <div className="grid grid-cols-3 gap-2">
              {OUTCOMES.map((o) => (
                <label
                  key={o}
                  className="opt flex cursor-pointer items-center justify-center px-2 py-2 text-center text-sm has-[:checked]:border-orc-orange has-[:checked]:bg-orc-orange has-[:checked]:font-black has-[:checked]:text-orc-black"
                >
                  <input type="radio" name="outcome" value={o} defaultChecked={value === o} className="sr-only" />
                  {outcomeLabel[o]}
                </label>
              ))}
            </div>
          </fieldset>
          <textarea
            name="note"
            rows={3}
            maxLength={1000}
            defaultValue={note ?? ""}
            placeholder="Comentario (qué tiene que mejorar, por qué sube, etc.)"
            aria-label={`Comentario: ${title}`}
            className="field-input h-auto py-2 text-base"
          />
        </ActionForm>
      )}
    </section>
  );
}
