import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchAll } from "@/lib/fetch-all";
import { campaignLabel, currentCampaign, OUTCOMES, outcomeOf } from "@/lib/ortho";
import { canManageInjuries, getViewer, getViewerCategories, isStaff } from "@/lib/server-data";
import { formatDate } from "@/lib/labels";
import { clubToday } from "@/lib/validation";

export const metadata: Metadata = { title: "Evaluación ortopédica" };
export const dynamic = "force-dynamic";

type OutcomeRow = { player_id: string; campaign: number; evaluated_on: string | null; outcome: string | null };

/** Evaluación ortopédica anual: estado por categoría y campaña. */
export default async function OrthoPage({ searchParams }: { searchParams: Promise<{ categoria?: string; campania?: string }> }) {
  const sp = await searchParams;
  const { supabase, season, profile } = await getViewer();
  if (!season || !isStaff(profile)) notFound();
  const manage = canManageInjuries(profile);
  const categories = await getViewerCategories();
  const category = categories.find((c) => c.id === sp.categoria) ?? categories[0] ?? null;
  const thisCampaign = currentCampaign(clubToday());

  // Resultados: la ficha completa para admin/área médica; sólo el resultado para el profe.
  const outcomes: OutcomeRow[] = manage
    ? await fetchAll<OutcomeRow>(
        () => supabase.from("ortho_evaluations").select("player_id, campaign, evaluated_on, outcome").order("id") as never,
      )
    : (((await supabase.rpc("ortho_outcomes")).data ?? []) as OutcomeRow[]);
  const campaigns = [...new Set([thisCampaign, ...outcomes.map((o) => o.campaign)])].sort((a, b) => b - a);
  const campaign = campaigns.includes(Number(sp.campania)) ? Number(sp.campania) : thisCampaign;

  const [rosterRes, consentRes] = await Promise.all([
    category
      ? supabase
          .from("player_season_categories")
          .select("player:players!inner(id, first_name, last_name, active)")
          .eq("season_id", season.id)
          .eq("category_id", category.id)
      : Promise.resolve({ data: [] }),
    supabase.from("consents").select("player_id").eq("consent_type", "medical_data").is("revoked_at", null),
  ]);
  const roster = ((rosterRes.data ?? []) as unknown as { player: { id: string; first_name: string; last_name: string; active: boolean } }[])
    .map((r) => r.player)
    .filter((p) => p.active)
    .sort((a, b) => a.last_name.localeCompare(b.last_name, "es") || a.first_name.localeCompare(b.first_name, "es"));
  const withConsent = new Set((consentRes.data ?? []).map((c) => c.player_id as string));
  const byPlayer = new Map(outcomes.filter((o) => o.campaign === campaign).map((o) => [o.player_id, o]));
  const evaluated = roster.filter((p) => byPlayer.has(p.id));
  const count = (v: string) => evaluated.filter((p) => byPlayer.get(p.id)?.outcome === v).length;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Evaluación ortopédica</h1>
          <p className="text-sm text-orc-muted">
            Campaña {campaignLabel(campaign)}
            {manage ? " · ficha traumatológica completa" : " · ves sólo el resultado: el detalle médico lo maneja el área médica"}
          </p>
        </div>
        {manage && (
          <Link href="/ortopedia/importar" className="btn-ghost h-10">
            Importar planilla
          </Link>
        )}
      </header>

      <form className="flex flex-wrap items-center gap-2">
        {categories.length > 1 && (
          <select name="categoria" defaultValue={category?.id} aria-label="Categoría" className="field-input h-10 w-auto text-base">
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <select name="campania" defaultValue={campaign} aria-label="Campaña" className="field-input h-10 w-auto text-base">
          {campaigns.map((c) => (
            <option key={c} value={c}>
              {campaignLabel(c)}
            </option>
          ))}
        </select>
        <button type="submit" className="btn-ghost h-10">
          Ver
        </button>
      </form>

      {!category ? (
        <p className="card">No tenés categorías asignadas.</p>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Resumen">
            <div className="card py-3">
              <p className="text-2xl font-black">
                {evaluated.length}
                <span className="text-base font-semibold text-orc-muted">/{roster.length}</span>
              </p>
              <p className="text-sm text-orc-muted">evaluados</p>
            </div>
            {OUTCOMES.map((o) => (
              <div key={o.value} className="card py-3">
                <p className="text-2xl font-black">{count(o.value)}</p>
                <p className="text-sm text-orc-muted">
                  {o.icon} {o.label.toLowerCase()}
                </p>
              </div>
            ))}
          </section>

          <section className="card p-0">
            <h2 className="px-4 pt-3 text-sm font-bold uppercase tracking-wide text-orc-muted">
              {category.name} · {roster.length} jugadores
            </h2>
            {roster.length === 0 ? (
              <p className="px-4 py-3 text-sm text-orc-muted">No hay jugadores en esta categoría.</p>
            ) : (
              <ul className="divide-y divide-orc-line">
                {roster.map((p) => {
                  const o = byPlayer.get(p.id);
                  const out = outcomeOf(o?.outcome);
                  const href = manage ? `/ortopedia/${p.id}?campania=${campaign}` : `/jugadores/${p.id}`;
                  return (
                    <li key={p.id}>
                      <Link href={href} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-orc-orange-soft">
                        <span className="min-w-0 flex-1 font-semibold">
                          {p.last_name}, {p.first_name}
                        </span>
                        {!withConsent.has(p.id) && <span className="chip tone-red">Sin consentimiento de salud</span>}
                        {o ? (
                          <span className="flex items-center gap-2">
                            {o.evaluated_on && <span className="text-xs text-orc-muted">{formatDate(o.evaluated_on)}</span>}
                            <span className={`chip ${out?.tone ?? ""}`}>{out ? `${out.icon} ${out.label}` : "Evaluado"}</span>
                          </span>
                        ) : (
                          <span className="chip">Pendiente</span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
