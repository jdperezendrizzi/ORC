import Link from "next/link";
import { loadCatalog, requireAdmin } from "@/lib/admin";
import { ageOn } from "@/lib/validation";

export const dynamic = "force-dynamic";

const FILTERS: Record<string, string> = {
  "": "Todos",
  "sin-consentimiento": "Sin consentimiento",
  "sin-tutor": "Menores sin tutor",
  "sin-categoria": "Sin categoría",
  bajas: "Dados de baja",
};

export default async function AdminPlayers({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string; filtro?: string; q?: string }>;
}) {
  const { categoria = "", filtro = "", q = "" } = await searchParams;
  const { supabase, season } = await requireAdmin();
  const { categories, positions } = await loadCatalog();

  const [players, psc, consents, links] = await Promise.all([
    supabase
      .from("players")
      .select("id, first_name, last_name, birth_date, primary_position_id, active")
      .is("deleted_at", null)
      .order("last_name"),
    supabase
      .from("player_season_categories")
      .select("player_id, category_id, jersey_number")
      .eq("season_id", season?.id ?? "00000000-0000-0000-0000-000000000000"),
    supabase.from("consents").select("player_id, consent_type").is("revoked_at", null),
    supabase.from("player_guardians").select("player_id"),
  ]);

  const catOf = new Map((psc.data ?? []).map((r) => [r.player_id as string, r]));
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const posName = new Map(positions.map((p) => [p.id, p.short_name]));
  const consentSet = new Map<string, Set<string>>();
  for (const c of consents.data ?? []) {
    const s = consentSet.get(c.player_id as string) ?? new Set<string>();
    s.add(c.consent_type as string);
    consentSet.set(c.player_id as string, s);
  }
  const guardianCount = new Map<string, number>();
  for (const l of links.data ?? []) guardianCount.set(l.player_id as string, (guardianCount.get(l.player_id as string) ?? 0) + 1);

  const needle = q.trim().toLowerCase();
  const rows = (players.data ?? [])
    .map((p) => ({
      ...p,
      id: p.id as string,
      age: ageOn(p.birth_date as string),
      psc: catOf.get(p.id as string),
      consents: consentSet.get(p.id as string) ?? new Set<string>(),
      guardians: guardianCount.get(p.id as string) ?? 0,
    }))
    .filter((p) => (filtro === "bajas" ? !p.active : p.active))
    .filter((p) => !categoria || p.psc?.category_id === categoria)
    .filter((p) => !needle || `${p.first_name} ${p.last_name}`.toLowerCase().includes(needle))
    .filter((p) => {
      if (filtro === "sin-consentimiento") return !p.consents.has("performance_data");
      if (filtro === "sin-tutor") return p.age < 18 && p.guardians === 0;
      if (filtro === "sin-categoria") return !p.psc;
      return true;
    });

  return (
    <div className="space-y-4">
      <form className="card flex flex-wrap items-end gap-3 p-3" role="search">
        <div className="min-w-40 flex-1">
          <label className="label" htmlFor="q">
            Buscar
          </label>
          <input id="q" name="q" defaultValue={q} placeholder="Nombre o apellido" className="field-input h-10 text-base" />
        </div>
        <div>
          <label className="label" htmlFor="categoria">
            Categoría
          </label>
          <select id="categoria" name="categoria" defaultValue={categoria} className="field-input h-10 text-base">
            <option value="">Todas</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="filtro">
            Mostrar
          </label>
          <select id="filtro" name="filtro" defaultValue={filtro} className="field-input h-10 text-base">
            {Object.entries(FILTERS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-ghost h-10">
          Filtrar
        </button>
        <Link href="/admin/jugadores/nuevo" className="btn-primary h-10 sm:ml-auto">
          + Nuevo jugador
        </Link>
      </form>

      <p className="text-sm text-orc-muted">
        {rows.length} jugador{rows.length === 1 ? "" : "es"} · temporada {season?.name ?? "—"}
      </p>

      <ul className="card divide-y divide-orc-line p-0">
        {rows.map((p) => {
          const minor = p.age < 18;
          return (
            <li key={p.id}>
              <Link href={`/admin/jugadores/${p.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-orc-orange-soft">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">
                    {p.last_name}, {p.first_name}
                  </span>
                  <span className="text-sm text-orc-muted">
                    {p.psc ? catName.get(p.psc.category_id as string) : "Sin categoría"}
                    {p.psc?.jersey_number ? ` · #${p.psc.jersey_number}` : ""}
                    {p.primary_position_id ? ` · ${posName.get(p.primary_position_id as number)}` : ""} · {p.age} años
                  </span>
                </span>
                <span className="flex flex-wrap gap-1">
                  {!p.consents.has("performance_data") && <span className="chip tone-amber">Sin consentimiento</span>}
                  {p.consents.has("performance_data") && !p.consents.has("medical_data") && (
                    <span className="chip tone-amber">Sin consent. salud</span>
                  )}
                  {minor && p.guardians === 0 && <span className="chip tone-red">Sin tutor</span>}
                  {!p.psc && <span className="chip tone-sky">Sin categoría</span>}
                  {!p.active && <span className="chip bg-orc-chip text-orc-muted">Baja</span>}
                </span>
                <span className="text-orc-muted">›</span>
              </Link>
            </li>
          );
        })}
        {rows.length === 0 && <li className="px-4 py-6 text-center text-sm text-orc-muted">No hay jugadores con ese filtro.</li>}
      </ul>
    </div>
  );
}
