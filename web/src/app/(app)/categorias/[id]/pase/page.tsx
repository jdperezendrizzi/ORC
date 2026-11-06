import type { Metadata } from "next";
import { canEdit, canView } from "@/lib/modules";
import { notFound } from "next/navigation";
import { getViewer, isStaff } from "@/lib/server-data";
import { loadCategorySheet } from "@/lib/promotion-server";
import { outcomeLabel, outcomeTone } from "@/lib/promotion";
import type { Category } from "@/lib/types";

export const metadata: Metadata = { title: "Pase de categoría" };
export const dynamic = "force-dynamic";

export default async function CategoryPromotionPage({
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
  const { data: category } = await supabase.from("categories").select("id, code, name, level, sort_order").eq("id", id).maybeSingle<Category>();
  if (!category) notFound();
  const { target, targetOptions, objectives, rows } = await loadCategorySheet(supabase, season, category, ref);
  const count = (k: "recommendation" | "decision", v: string) => rows.filter((r) => r[k] === v).length;

  return (
    <div className="space-y-5">
      <a href={`/categorias/${id}`} className="text-sm text-orc-muted">
        ← {category.name}
      </a>
      <header className="space-y-2">
        <p className="text-sm text-orc-muted">Pase de categoría · temporada {season.name}</p>
        <h1 className="text-2xl font-black">
          {category.name} {target ? `→ ${target.name}` : ""}
        </h1>
        <p className="text-sm text-orc-muted">
          {objectives ? `Objetivos de la categoría: ${objectives.done} de ${objectives.total} logrados · ` : ""}
          Decisiones: {count("decision", "promote")} suben · {count("decision", "observe")} en observación · {count("decision", "stay")} se quedan ·{" "}
          {rows.filter((r) => !r.decision).length} pendientes
        </p>
        {canEdit(modules, "season_rollover") && (
          <a href={`/pase-de-temporada?categoria=${category.id}`} className="btn-primary inline-flex">
            Aplicar pases a la temporada siguiente →
          </a>
        )}
        {targetOptions.length > 1 && (
          <form method="get" className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="label">Comparar con</span>
              <select name="ref" defaultValue={target?.id} className="field-input">
                {targetOptions.map((c) => (
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

      <section className="card overflow-x-auto p-0">
        <table className="w-full min-w-[620px] text-sm">
          <thead className="bg-orc-black text-left text-xs uppercase tracking-wide text-white">
            <tr>
              <th className="px-3 py-2">Jugador</th>
              <th className="px-3 py-2 text-right">Asist.</th>
              <th className="px-3 py-2 text-right" title={`Tests en la mediana de ${target?.name ?? "la categoría siguiente"} o mejor`}>
                Tests ≥ mediana
              </th>
              <th className="px-3 py-2">Recomendación</th>
              <th className="px-3 py-2">Decisión</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-orc-line">
            {rows.map((r) => (
              <tr key={r.playerId} className="hover:bg-orc-orange-soft">
                <td className="px-3 py-2">
                  <a href={`/jugadores/${r.playerId}/pase${ref ? `?ref=${ref}` : ""}`} className="font-semibold hover:underline">
                    {r.name}
                  </a>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.attendancePct === null ? "—" : `${r.attendancePct}%`}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.tests.total ? `${r.tests.above}/${r.tests.total}` : "—"}</td>
                <td className="px-3 py-2">{r.recommendation ? <span className={`chip ${outcomeTone[r.recommendation]}`}>{outcomeLabel[r.recommendation]}</span> : <span className="text-orc-muted">—</span>}</td>
                <td className="px-3 py-2">{r.decision ? <span className={`chip ${outcomeTone[r.decision]}`}>{outcomeLabel[r.decision]}</span> : <span className="text-orc-muted">Pendiente</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-orc-line px-3 py-2 text-xs text-orc-muted">
          <b>Tests ≥ mediana</b>: en cuántos tests físicos su mejor marca de la temporada está en la mediana de {target?.name ?? "la categoría siguiente"} (de
          su misma unidad, forwards o backs) o mejor, sobre los que tienen referencia. Tocá un jugador para ver la ficha completa y
          cargar la recomendación o la decisión.
        </p>
      </section>
    </div>
  );
}
