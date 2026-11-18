import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ActionForm, InlineAction } from "@/components/action-form";
import { Field } from "@/app/(app)/admin/jugadores/player-fields";
import {
  BLOOD_TYPES,
  campaignLabel,
  currentCampaign,
  outcomeOf,
  REGIONS,
  regionStatusOf,
  type OrthoEvaluation,
} from "@/lib/ortho";
import { formatDate } from "@/lib/labels";
import { canManageInjuries, getViewer } from "@/lib/server-data";
import { clubToday } from "@/lib/validation";
import { deleteOrthoEvaluation, savePlayerHealth } from "../actions";
import { OrthoForm } from "./ortho-form";
import { OrthoEvolutionChart } from "./ortho-evolution";

export const metadata: Metadata = { title: "Ficha traumatológica" };
export const dynamic = "force-dynamic";

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const show = (v: unknown, unit = "") => (v === null || v === undefined || v === "" ? "—" : `${String(v).replace(".", ",")}${unit ? ` ${unit}` : ""}`);

export default async function OrthoPlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ playerId: string }>;
  searchParams: Promise<{ campania?: string }>;
}) {
  const { playerId } = await params;
  const sp = await searchParams;
  const { supabase, profile, season } = await getViewer();
  // El profe no ve la ficha: va al perfil del jugador, donde ve sólo el resultado.
  if (!canManageInjuries(profile)) redirect(`/jugadores/${playerId}`);
  const today = clubToday();

  const [playerRes, evalRes, privRes, consentRes, catRes] = await Promise.all([
    supabase.from("players").select("id, first_name, last_name, birth_date").eq("id", playerId).maybeSingle(),
    supabase.from("ortho_evaluations").select("*").eq("player_id", playerId).order("campaign"),
    supabase.from("player_private").select("blood_type, health_insurance, health_insurance_number").eq("player_id", playerId).maybeSingle(),
    supabase.from("consents").select("id").eq("player_id", playerId).eq("consent_type", "medical_data").is("revoked_at", null).limit(1),
    season
      ? supabase.from("player_season_categories").select("category:categories(id, name)").eq("player_id", playerId).eq("season_id", season.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const player = playerRes.data;
  if (!player) notFound();
  const evals = (evalRes.data ?? []) as OrthoEvaluation[];
  const priv = privRes.data;
  const hasConsent = (consentRes.data ?? []).length > 0;
  const category = (catRes.data as unknown as { category: { id: string; name: string } | null } | null)?.category ?? null;

  const thisCampaign = currentCampaign(today);
  const requested = Number(sp.campania);
  const campaign = Number.isInteger(requested) && requested >= 2015 && requested <= thisCampaign + 1 ? requested : thisCampaign;
  const current = evals.find((e) => e.campaign === campaign) ?? null;
  const options = [...new Set([thisCampaign, thisCampaign - 1, ...evals.map((e) => e.campaign)])].sort((a, b) => b - a);
  const latest = [...evals].reverse().find((e) => e.indications || e.referrals);

  return (
    <div className="space-y-5">
      <Link href={`/ortopedia${category ? `?categoria=${category.id}&campania=${campaign}` : ""}`} className="text-sm text-orc-muted">
        ← Evaluación ortopédica
      </Link>
      <header className="space-y-1">
        <h1 className="text-2xl font-black">
          {player.last_name}, {player.first_name}
        </h1>
        <p className="text-sm text-orc-muted">
          Ficha traumatológica{category ? ` · ${category.name}` : ""} · nació el {formatDate(player.birth_date as string, { day: "numeric", month: "short", year: "numeric" })} ·{" "}
          <Link href={`/jugadores/${player.id}`} className="font-semibold text-orc-orange-strong hover:underline">
            ver perfil
          </Link>
        </p>
      </header>

      {!hasConsent && (
        <p className="card tone-red">
          No tiene firmado el <strong>consentimiento de salud</strong>: no se puede cargar la evaluación. El admin lo registra en Admin › Jugadores.
        </p>
      )}

      {/* Evolución */}
      {evals.length > 0 && (
        <section className="card space-y-4">
          <h2 className="text-lg font-black">Evolución</h2>
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[34rem] whitespace-nowrap text-sm">
              <thead>
                <tr className="text-left text-orc-muted">
                  <th className="py-1 pr-3 font-semibold">Campaña</th>
                  <th className="py-1 pr-3 font-semibold">Peso</th>
                  <th className="py-1 pr-3 font-semibold">Altura</th>
                  <th className="py-1 pr-3 font-semibold">IMC</th>
                  {REGIONS.map((r) => (
                    <th key={r.key} className="py-1 pr-3 font-semibold">
                      {r.label}
                    </th>
                  ))}
                  <th className="py-1 pr-3 font-semibold">Sit &amp; reach</th>
                  <th className="py-1 font-semibold">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-orc-line">
                {[...evals].reverse().map((e) => {
                  const out = outcomeOf(e.outcome as string);
                  return (
                    <tr key={e.id} className={e.campaign === campaign ? "bg-orc-orange-soft" : ""}>
                      <td className="py-2 pr-3 font-semibold">
                        <Link href={`?campania=${e.campaign}`} className="hover:underline">
                          {campaignLabel(e.campaign)}
                        </Link>
                      </td>
                      <td className="py-2 pr-3">{show(e.weight_kg, "kg")}</td>
                      <td className="py-2 pr-3">{show(e.height_cm, "cm")}</td>
                      <td className="py-2 pr-3">{show(e.bmi)}</td>
                      {REGIONS.map((r) => {
                        const s = regionStatusOf(e[`${r.key}_status`] as string);
                        return (
                          <td key={r.key} className="py-2 pr-3" title={(e[`${r.key}_notes`] as string) ?? undefined}>
                            {s ? `${s.icon} ${s.label}` : "—"}
                          </td>
                        );
                      })}
                      <td className="py-2 pr-3">{show(e.sit_reach_cm, "cm")}</td>
                      <td className="py-2">{out ? <span className={`chip ${out.tone}`}>{out.icon} {out.label}</span> : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <OrthoEvolutionChart
            points={evals.map((e) => ({
              campaign: campaignLabel(e.campaign),
              weight_kg: num(e.weight_kg),
              height_cm: num(e.height_cm),
              bmi: num(e.bmi),
              sit_reach_cm: num(e.sit_reach_cm),
            }))}
          />
          {latest && (
            <div className="rounded-xl border border-orc-line p-3 text-sm">
              <p className="font-bold">Indicaciones vigentes ({campaignLabel(latest.campaign)})</p>
              {typeof latest.indications === "string" && latest.indications && <p className="whitespace-pre-line">{latest.indications}</p>}
              {typeof latest.referrals === "string" && latest.referrals && (
                <p className="whitespace-pre-line">
                  <span className="font-semibold">Derivaciones:</span> {latest.referrals}
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {/* Datos fijos */}
      <section className="card space-y-3">
        <h2 className="text-lg font-black">Datos de salud</h2>
        <ActionForm action={savePlayerHealth} submitLabel="Guardar datos" submitClassName="btn-ghost">
          <input type="hidden" name="player_id" value={player.id} />
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Grupo sanguíneo" id="blood_type">
              <select key={priv?.blood_type ?? ""} id="blood_type" name="blood_type" defaultValue={priv?.blood_type ?? ""} className="field-input">
                <option value="">Sin dato</option>
                {BLOOD_TYPES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Obra social" id="health_insurance">
              <input id="health_insurance" name="health_insurance" maxLength={120} defaultValue={priv?.health_insurance ?? ""} className="field-input" />
            </Field>
            <Field label="N° de afiliado" id="health_insurance_number">
              <input id="health_insurance_number" name="health_insurance_number" maxLength={60} defaultValue={priv?.health_insurance_number ?? ""} className="field-input" />
            </Field>
          </div>
        </ActionForm>
      </section>

      {/* Ficha de la campaña */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-black">Ficha {campaignLabel(campaign)}</h2>
            <p className="text-sm text-orc-muted">{current ? "Cargada: podés corregirla." : "Todavía no se cargó."}</p>
          </div>
          <form className="flex items-center gap-2">
            <select name="campania" defaultValue={campaign} aria-label="Campaña" className="field-input h-10 w-auto text-base">
              {options.map((c) => (
                <option key={c} value={c}>
                  {campaignLabel(c)}
                  {evals.some((e) => e.campaign === c) ? " ✓" : ""}
                </option>
              ))}
            </select>
            <button type="submit" className="btn-ghost h-10">
              Ir
            </button>
          </form>
        </div>
        {hasConsent || current ? (
          <OrthoForm key={campaign} playerId={player.id} campaign={campaign} initial={current} today={today} />
        ) : null}
        {current && profile?.role === "admin" && (
          <InlineAction
            action={deleteOrthoEvaluation}
            fields={{ id: current.id, player_id: player.id }}
            label={`Borrar la evaluación ${campaignLabel(campaign)}`}
            confirmText={`¿Borrar la evaluación ${campaignLabel(campaign)} de ${player.first_name}? Queda registrado en la auditoría.`}
            className="text-sm font-semibold text-bad hover:underline"
          />
        )}
      </section>
    </div>
  );
}
