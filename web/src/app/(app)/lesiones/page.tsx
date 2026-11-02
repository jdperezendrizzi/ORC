import type { Metadata } from "next";
import Link from "next/link";
import { getViewer, getViewerCategories } from "@/lib/server-data";
import { bodyRegionLabel, formatDate, injuryContextLabel, injuryStatusLabel, injuryStatusTone, injuryTypeLabel } from "@/lib/labels";
import { clubToday } from "@/lib/validation";

export const metadata: Metadata = { title: "Lesiones" };
export const dynamic = "force-dynamic";

type Row = {
  id: string;
  player_id: string;
  occurred_on: string;
  context: string;
  body_region: string;
  injury_type: string;
  status: string;
  expected_return: string | null;
  actual_return: string | null;
  days_lost: number | null;
  is_recurrence: boolean;
  player: { first_name: string; last_name: string } | null;
};

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

export default async function InjuriesPage({ searchParams }: { searchParams: Promise<{ categoria?: string }> }) {
  const { categoria = "" } = await searchParams;
  const { supabase, season } = await getViewer();
  const categories = await getViewerCategories();
  const today = clubToday();

  const [injRes, pscRes] = await Promise.all([
    supabase
      .from("injuries")
      .select("id, player_id, occurred_on, context, body_region, injury_type, status, expected_return, actual_return, days_lost, is_recurrence, player:players(first_name, last_name)")
      .is("deleted_at", null)
      .order("occurred_on", { ascending: false })
      .limit(300),
    supabase
      .from("player_season_categories")
      .select("player_id, category_id")
      .eq("season_id", season?.id ?? "00000000-0000-0000-0000-000000000000"),
  ]);
  const catOf = new Map((pscRes.data ?? []).map((r) => [r.player_id as string, r.category_id as string]));
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const rows = ((injRes.data ?? []) as unknown as Row[]).filter((r) => !categoria || catOf.get(r.player_id) === categoria);
  const open = rows.filter((r) => r.status !== "closed");
  const closed = rows.filter((r) => r.status === "closed");

  const item = (r: Row) => {
    const out = r.status === "closed" ? r.days_lost : daysBetween(r.occurred_on, today);
    const overdue = r.status !== "closed" && r.expected_return && r.expected_return < today;
    return (
      <li key={r.id}>
        <Link href={`/lesiones/${r.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-orc-orange-soft">
          <span className="w-full min-w-0 sm:w-auto sm:flex-1">
            <span className="block font-semibold">
              {r.player?.last_name}, {r.player?.first_name}
              {r.injury_type === "concussion" && <span className="chip tone-red ml-2 align-middle">Conmoción</span>}
            </span>
            <span className="text-sm text-orc-muted">
              {injuryTypeLabel[r.injury_type]} · {bodyRegionLabel[r.body_region]} · {injuryContextLabel[r.context]} ·{" "}
              {formatDate(r.occurred_on, { day: "numeric", month: "short" })}
              {catName.get(catOf.get(r.player_id) ?? "") ? ` · ${catName.get(catOf.get(r.player_id) ?? "")}` : ""}
              {r.is_recurrence ? " · recidiva" : ""}
            </span>
          </span>
          <span className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end sm:gap-1 sm:text-right">
            <span className={`chip ${injuryStatusTone[r.status]}`}>{injuryStatusLabel[r.status]}</span>
            <span className={`text-xs ${overdue ? "font-semibold text-warn" : "text-orc-muted"}`}>
              {out !== null && `${out} días fuera`}
              {r.status !== "closed" && r.expected_return && ` · vuelve ${formatDate(r.expected_return)}${overdue ? " (vencido)" : ""}`}
            </span>
          </span>
        </Link>
      </li>
    );
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Lesiones</h1>
          <p className="text-sm text-orc-muted">
            {open.length} activa{open.length === 1 ? "" : "s"} · temporada {season?.name ?? "—"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {categories.length > 1 && (
            <form>
              <select name="categoria" defaultValue={categoria} aria-label="Categoría" className="field-input h-10 w-auto text-base">
                <option value="">Todas las categorías</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn-ghost ml-2 h-10">
                Filtrar
              </button>
            </form>
          )}
          <Link href="/lesiones/nueva" className="btn-primary h-10">
            + Registrar lesión
          </Link>
        </div>
      </header>

      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-orc-muted">Activas</h2>
        {open.length === 0 ? (
          <p className="card text-sm">No hay lesiones activas.</p>
        ) : (
          <ul className="card divide-y divide-orc-line p-0">{open.map(item)}</ul>
        )}
      </section>

      {closed.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-orc-muted">Historial (con alta)</h2>
          <ul className="card divide-y divide-orc-line p-0">{closed.slice(0, 50).map(item)}</ul>
        </section>
      )}
    </div>
  );
}
