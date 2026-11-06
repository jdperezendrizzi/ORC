import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { canEdit, canView } from "@/lib/modules";
import { nextCategory, outcomeLabel, type Outcome } from "@/lib/promotion";
import { proposeCategory, type RolloverCategory } from "@/lib/rollover";
import { getViewer, getViewerCategories } from "@/lib/server-data";
import type { Category } from "@/lib/types";
import { RolloverTable, type RolloverRow } from "./rollover-table";

export const metadata: Metadata = { title: "Armar temporada" };
export const dynamic = "force-dynamic";

export default async function SeasonRolloverPage({ searchParams }: { searchParams: Promise<{ categoria?: string; destino?: string }> }) {
  const { categoria, destino } = await searchParams;
  const { supabase, season, profile, modules } = await getViewer();
  if (!season || !profile || !canView(modules, "season_rollover")) notFound();
  const canApply = canEdit(modules, "season_rollover");
  const isAdmin = profile.role === "admin";

  const [catsRes, seasonsRes, currentRes, mine] = await Promise.all([
    supabase.from("categories").select("id, code, name, level, sort_order, max_age").eq("active", true).order("sort_order"),
    supabase.from("seasons").select("id, name, starts_on").order("starts_on"),
    supabase.from("seasons").select("starts_on").eq("id", season.id).single(),
    getViewerCategories(),
  ]);
  const allCats = (catsRes.data ?? []) as (Category & { max_age: number | null })[];
  // Origen: el admin elige cualquiera; un profe habilitado, sólo las suyas.
  const origins = isAdmin ? allCats : allCats.filter((c) => mine.some((m) => m.id === c.id));
  const future = (seasonsRes.data ?? []).filter((s) => (s.starts_on as string) > (currentRes.data?.starts_on as string));

  const header = (
    <header className="space-y-1">
      <p className="text-sm text-orc-muted">Temporada actual: {season.name}</p>
      <h1 className="text-2xl font-black">Armar temporada</h1>
      <p className="text-sm text-orc-muted">
        Pasa a los jugadores de una categoría a la temporada siguiente, todos juntos. La propuesta sale de la decisión de la evaluación
        de pase; si no hay decisión (o está en observación), de la categoría que le toca por edad. Revisá y cambiá lo que haga falta
        antes de aplicar.
      </p>
    </header>
  );

  if (future.length === 0) {
    return (
      <div className="space-y-4">
        {header}
        <p className="card text-sm">
          Primero hay que crear la temporada siguiente{isAdmin ? <> en <a href="/admin/temporada" className="font-semibold text-orc-orange-strong">Admin → Temporada</a></> : " (lo hace el admin)"}.
          No la marques como actual hasta aplicar los pases.
        </p>
      </div>
    );
  }
  if (origins.length === 0) return <div className="space-y-4">{header}<p className="card text-sm">No tenés categorías asignadas.</p></div>;

  const origin = origins.find((c) => c.id === categoria) ?? origins[0];
  const to = future.find((s) => s.id === destino) ?? future[0];
  const seasonYear = Number(String(to.starts_on).slice(0, 4));

  const { data: rosterData } = await supabase
    .from("player_season_categories")
    .select("player:players!inner(id, first_name, last_name, birth_date, active)")
    .eq("season_id", season.id)
    .eq("category_id", origin.id);
  type R = { player: { id: string; first_name: string; last_name: string; birth_date: string; active: boolean } };
  const roster = ((rosterData ?? []) as unknown as R[]).filter((r) => r.player.active).map((r) => r.player);
  const ids = roster.map((p) => p.id);
  const none = ["00000000-0000-0000-0000-000000000000"];

  const [reviewsRes, existingRes] = await Promise.all([
    supabase.from("promotion_reviews").select("player_id, decision, recommendation, target_category_id").eq("season_id", season.id).in("player_id", ids.length ? ids : none),
    supabase.from("player_season_categories").select("player_id, category_id").eq("season_id", to.id).in("player_id", ids.length ? ids : none),
  ]);
  const reviews = new Map((reviewsRes.data ?? []).map((r) => [r.player_id as string, r]));
  const existing = new Map((existingRes.data ?? []).map((r) => [r.player_id as string, r.category_id as string]));
  const catName = new Map(allCats.map((c) => [c.id, c.name]));
  const rollCats: RolloverCategory[] = allCats.map((c) => ({ id: c.id, name: c.name, sort_order: c.sort_order, max_age: c.max_age }));
  const next = nextCategory(allCats, origin.id);

  const rows: RolloverRow[] = roster
    .sort((a, b) => a.last_name.localeCompare(b.last_name))
    .map((p) => {
      const rev = reviews.get(p.id);
      const proposal = proposeCategory({
        categories: rollCats,
        currentCategoryId: origin.id,
        birthDate: p.birth_date,
        seasonYear,
        decision: (rev?.decision as Outcome) ?? null,
        decisionTargetId: (rev?.target_category_id as string) ?? null,
        nextCategoryId: next?.id ?? null,
      });
      const already = existing.get(p.id);
      return {
        playerId: p.id,
        name: `${p.last_name}, ${p.first_name}`,
        ageNext: seasonYear - Number(p.birth_date.slice(0, 4)),
        proposedId: proposal.categoryId,
        reason: proposal.reason,
        recommendation: !rev?.decision && rev?.recommendation ? outcomeLabel[rev.recommendation as Outcome].toLowerCase() : null,
        alreadyIn: already ? (catName.get(already) ?? "otra categoría") : null,
      };
    });

  return (
    <div className="space-y-4">
      {header}
      <form method="get" className="card flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="label">Categoría {season.name}</span>
          <select name="categoria" defaultValue={origin.id} className="field-input">
            {origins.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Pasan a la temporada</span>
          <select name="destino" defaultValue={to.id} className="field-input">
            {future.map((s) => (
              <option key={s.id as string} value={s.id as string}>
                {s.name as string}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn-ghost h-11">
          Ver
        </button>
      </form>

      {rows.length === 0 ? (
        <p className="card text-sm">No hay jugadores activos en {origin.name} esta temporada.</p>
      ) : (
        <RolloverTable
          key={`${origin.id}-${to.id}`}
          rows={rows}
          categories={allCats.map((c) => ({ id: c.id, name: c.name }))}
          toSeason={{ id: to.id as string, name: to.name as string }}
          canApply={canApply}
        />
      )}
      <p className="text-xs text-orc-muted">
        Después de aplicar: el admin asigna las categorías de los profes para {to.name as string} (Admin → Usuarios) y recién ahí marca{" "}
        {to.name as string} como temporada actual.
      </p>
    </div>
  );
}
