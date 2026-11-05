import type { Metadata } from "next";
import { canEdit } from "@/lib/modules";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { canManageInjuries, getViewer } from "@/lib/server-data";
import {
  bodyRegionLabel,
  formatDate,
  INJURY_STATUS_FLOW,
  injuryContextLabel,
  injuryMechanismLabel,
  injuryStatusLabel,
  injuryStatusTone,
  injuryTypeLabel,
  sideLabel,
} from "@/lib/labels";
import { clubToday } from "@/lib/validation";
import { Field } from "../../admin/jugadores/player-fields";
import { addInjuryNote, updateInjury } from "../actions";

export const metadata: Metadata = { title: "Lesión" };
export const dynamic = "force-dynamic";

const long = (d: string) => formatDate(d, { day: "numeric", month: "short", year: "numeric" });

export default async function InjuryDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ nueva?: string }>;
}) {
  const { id } = await params;
  const { nueva } = await searchParams;
  const { supabase, profile, modules } = await getViewer();
  const manage = canManageInjuries(profile) && canEdit(modules, "injuries");

  const { data: inj } = await supabase
    .from("injuries")
    .select(
      "id, player_id, occurred_on, context, body_region, injury_type, side, mechanism, is_recurrence, status, expected_return, actual_return, days_lost, summary, created_at, updated_at, player:players(first_name, last_name), reporter:profiles!injuries_reported_by_fkey(full_name)",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!inj) notFound();

  // Notas clínicas: la RLS sólo se las devuelve a área médica/admin.
  const notes = manage
    ? ((
        await supabase
          .from("injury_notes")
          .select("id, note, diagnosis, treatment, created_at, author:profiles!injury_notes_author_id_fkey(full_name)")
          .eq("injury_id", id)
          .order("created_at", { ascending: false })
      ).data ?? [])
    : [];

  type I = typeof inj & { player: { first_name: string; last_name: string } | null; reporter: { full_name: string } | null };
  const i = inj as I;
  const today = clubToday();
  const daysOut = i.status === "closed" ? (i.days_lost ?? 0) : Math.round((Date.parse(today) - Date.parse(i.occurred_on as string)) / 864e5);
  const step = INJURY_STATUS_FLOW.indexOf(i.status as (typeof INJURY_STATUS_FLOW)[number]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/lesiones" className="text-sm text-orc-muted">
          ← Lesiones
        </Link>
        <Link href={`/jugadores/${i.player_id}`} className="text-sm font-semibold text-orc-orange-strong">
          Ver perfil del jugador →
        </Link>
      </div>

      {nueva && <p className="chip tone-green px-3 py-1 text-sm">Lesión registrada. El área médica ya la ve en su lista.</p>}

      <header className="card space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-black">
              {i.player?.first_name} {i.player?.last_name}
            </h1>
            <p className="text-orc-muted">
              {injuryTypeLabel[i.injury_type as string]} · {bodyRegionLabel[i.body_region as string]}
              {i.side ? ` (${sideLabel[i.side as string].toLowerCase()})` : ""}
              {i.is_recurrence ? " · recidiva" : ""}
            </p>
          </div>
          <span className={`chip text-sm ${injuryStatusTone[i.status as string]}`}>{injuryStatusLabel[i.status as string]}</span>
        </div>

        {/* Línea de seguimiento */}
        <ol className="grid grid-cols-4 gap-1" aria-label="Seguimiento">
          {INJURY_STATUS_FLOW.map((s, idx) => (
            <li key={s} className="text-center text-xs">
              <span className={`block h-1.5 rounded-full ${idx <= step ? "bg-orc-orange" : "bg-orc-line"}`} />
              <span className={`mt-1 block ${idx === step ? "font-bold text-orc-ink" : "text-orc-muted"}`}>{injuryStatusLabel[s]}</span>
            </li>
          ))}
        </ol>

        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-orc-muted">Fecha</dt>
            <dd className="font-semibold">{long(i.occurred_on as string)}</dd>
          </div>
          <div>
            <dt className="text-orc-muted">Días fuera</dt>
            <dd className="font-semibold tabular-nums">{daysOut}</dd>
          </div>
          <div>
            <dt className="text-orc-muted">{i.status === "closed" ? "Volvió" : "Regreso estimado"}</dt>
            <dd className="font-semibold">
              {i.status === "closed" ? (i.actual_return ? long(i.actual_return as string) : "—") : i.expected_return ? long(i.expected_return as string) : "Sin definir"}
            </dd>
          </div>
          <div>
            <dt className="text-orc-muted">Dónde / cómo</dt>
            <dd className="font-semibold">
              {injuryContextLabel[i.context as string]} · {injuryMechanismLabel[i.mechanism as string].toLowerCase()}
            </dd>
          </div>
        </dl>
        {i.summary && <p className="rounded-lg bg-orc-chip px-3 py-2 text-sm">{i.summary as string}</p>}
        <p className="text-xs text-orc-muted">
          Registrada por {i.reporter?.full_name ?? "—"} el {long(String(i.created_at))}
        </p>

        {i.injury_type === "concussion" && i.status !== "closed" && (
          <p className="rounded-lg tone-red px-3 py-2 text-sm">
            <b>Conmoción:</b> no vuelve a entrenar con contacto ni a jugar hasta completar el protocolo de regreso gradual de
            World Rugby (más estricto en menores de 19) y tener el alta médica.
          </p>
        )}
      </header>

      {manage ? (
        <>
          <section className="card space-y-3">
            <h2 className="font-bold">Seguimiento</h2>
            <ActionForm action={updateInjury} submitLabel="Guardar">
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="occurred_on" value={i.occurred_on as string} />
              <fieldset>
                <legend className="label">Estado</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {INJURY_STATUS_FLOW.map((s) => (
                    <label key={s} className="opt flex cursor-pointer items-center justify-center gap-2 px-3 py-2 text-sm has-[:checked]:border-orc-orange has-[:checked]:bg-orc-orange has-[:checked]:font-black has-[:checked]:text-orc-black">
                      <input type="radio" name="status" value={s} defaultChecked={s === i.status} className="sr-only" />
                      {injuryStatusLabel[s]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Regreso estimado" id="expected_return">
                  <input
                    id="expected_return"
                    name="expected_return"
                    type="date"
                    min={i.occurred_on as string}
                    defaultValue={(i.expected_return as string) ?? ""}
                    className="field-input"
                  />
                </Field>
                <Field label="Regreso real (al dar el alta)" id="actual_return" help="Si das el alta y lo dejás vacío, se usa la fecha de hoy.">
                  <input
                    id="actual_return"
                    name="actual_return"
                    type="date"
                    min={i.occurred_on as string}
                    max={today}
                    defaultValue={(i.actual_return as string) ?? ""}
                    className="field-input"
                  />
                </Field>
              </div>
              <Field label="Descripción visible para el profe (sin datos clínicos)" id="u_summary">
                <input id="u_summary" name="summary" maxLength={200} defaultValue={(i.summary as string) ?? ""} className="field-input" />
              </Field>
            </ActionForm>
          </section>

          <section className="card space-y-3">
            <div>
              <h2 className="font-bold">Notas clínicas</h2>
              <p className="text-sm text-orc-muted">Sólo las ven el área médica y el admin. Los profes no tienen acceso.</p>
            </div>
            <ActionForm action={addInjuryNote} submitLabel="Agregar nota" resetOnSuccess>
              <input type="hidden" name="injury_id" value={id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Diagnóstico (opcional)" id="diagnosis">
                  <input id="diagnosis" name="diagnosis" className="field-input" />
                </Field>
                <Field label="Tratamiento (opcional)" id="treatment">
                  <input id="treatment" name="treatment" className="field-input" />
                </Field>
              </div>
              <Field label="Nota" id="note">
                <textarea id="note" name="note" required rows={3} className="field-input h-auto py-2 text-base" />
              </Field>
            </ActionForm>
            {notes.length > 0 && (
              <ul className="divide-y divide-orc-line rounded-lg border border-orc-line">
                {(notes as unknown as { id: string; note: string; diagnosis: string | null; treatment: string | null; created_at: string; author: { full_name: string } | null }[]).map((n) => (
                  <li key={n.id} className="space-y-1 px-3 py-2 text-sm">
                    <p className="text-xs text-orc-muted">
                      {long(n.created_at)} · {n.author?.full_name ?? "—"}
                    </p>
                    {n.diagnosis && (
                      <p>
                        <b>Diagnóstico:</b> {n.diagnosis}
                      </p>
                    )}
                    {n.treatment && (
                      <p>
                        <b>Tratamiento:</b> {n.treatment}
                      </p>
                    )}
                    <p className="whitespace-pre-line">{n.note}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : (
        <p className="card text-sm text-orc-muted">
          El seguimiento (estado, alta y notas clínicas) lo hace el área médica. Acá vas a ver cuando cambie el estado y la fecha
          estimada de regreso.
        </p>
      )}
    </div>
  );
}
