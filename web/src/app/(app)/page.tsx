import { LogoutButton } from "@/components/app-chrome";
import { canLoadResults, getViewer, getViewerCategories, roleLabel } from "@/lib/server-data";
import { formatDate, injuryStatusLabel, injuryStatusTone, sessionTypeLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { supabase, profile, season } = await getViewer();
  const categories = await getViewerCategories();
  const categoryIds = categories.map((c) => c.id);

  if (!season) {
    return <Empty title="No hay temporada actual" text="Un admin tiene que crear la temporada y marcarla como actual." />;
  }
  if (categories.length === 0) {
    return <Empty title="Sin categorías asignadas" text="Pedile al admin que te asigne una categoría para esta temporada." />;
  }

  const [rosterRes, injuriesRes, consentsRes, sessionsRes] = await Promise.all([
    supabase
      .from("player_season_categories")
      .select("player_id, category_id")
      .eq("season_id", season.id)
      .in("category_id", categoryIds),
    supabase
      .from("injuries")
      .select("id, player_id, status, body_region, expected_return, player:players(first_name, last_name)")
      .neq("status", "closed")
      .is("deleted_at", null)
      .order("occurred_on", { ascending: false }),
    supabase.from("consents").select("player_id, consent_type").is("revoked_at", null),
    supabase
      .from("evaluation_sessions")
      .select("id, category_id, session_type, session_date, title")
      .in("category_id", categoryIds)
      .is("deleted_at", null)
      .order("session_date", { ascending: false })
      .limit(6),
  ]);

  const roster = rosterRes.data ?? [];
  const playerCategory = new Map(roster.map((r) => [r.player_id as string, r.category_id as string]));
  type InjuryRow = {
    id: string;
    player_id: string;
    status: string;
    expected_return: string | null;
    player: { first_name: string; last_name: string } | null;
  };
  const injuries = ((injuriesRes.data ?? []) as unknown as InjuryRow[]).filter((i) => playerCategory.has(i.player_id));
  const withPerf = new Set(
    (consentsRes.data ?? []).filter((c) => c.consent_type === "performance_data").map((c) => c.player_id as string),
  );
  const catName = new Map(categories.map((c) => [c.id, c.name]));

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm text-orc-muted">Temporada {season.name}</p>
        <h1 className="text-2xl font-black">Hola, {profile?.full_name?.split(" ")[0]}</h1>
      </section>

      {canLoadResults(profile) && (
        <section className="grid grid-cols-2 gap-3">
          <a href="/cargar" className="btn-primary h-16 text-base">
            + Cargar datos
          </a>
          <a href="/bienestar" className="btn-dark h-16 text-base">
            Bienestar del día
          </a>
        </section>
      )}

      <a href="/guia" className="card flex items-center gap-3 py-3 hover:border-orc-orange">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-orc-orange-soft text-lg font-black text-orc-orange-strong">
          ?
        </span>
        <span className="flex-1">
          <span className="block font-semibold">¿Qué medimos y para qué?</span>
          <span className="text-sm text-orc-muted">Guía de cada test, métrica y gráfico</span>
        </span>
        <span className="text-orc-muted">›</span>
      </a>

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-orc-muted">Categorías</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {categories.map((c) => {
            const players = roster.filter((r) => r.category_id === c.id);
            const injured = injuries.filter((i) => playerCategory.get(i.player_id) === c.id).length;
            const noConsent = players.filter((p) => !withPerf.has(p.player_id as string)).length;
            return (
              <li key={c.id}>
                <a href={`/categorias/${c.id}`} className="card flex items-center gap-4 hover:border-orc-orange">
                  <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-orc-black text-sm font-black text-orc-orange">
                    {c.code.length > 4 ? c.code.slice(0, 3) : c.code}
                  </span>
                  <span className="flex-1">
                    <span className="block font-bold">{c.name}</span>
                    <span className="text-sm text-orc-muted">{players.length} jugadores</span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    {injured > 0 && <span className="chip tone-red">{injured} {injured === 1 ? "lesionado" : "lesionados"}</span>}
                    {noConsent > 0 && (
                      <span className="chip tone-amber">{noConsent} sin consentimiento</span>
                    )}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </section>

      {injuries.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-orc-muted">Disponibilidad</h2>
          <ul className="card divide-y divide-orc-line p-0">
            {injuries.map((i) => (
              <li key={i.id}>
                <a href={`/jugadores/${i.player_id}`} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span>
                    <span className="font-semibold">
                      {i.player?.first_name} {i.player?.last_name}
                    </span>
                    <span className="block text-xs text-orc-muted">
                      {catName.get(playerCategory.get(i.player_id) ?? "")}
                      {i.expected_return && ` · vuelve aprox. ${formatDate(i.expected_return)}`}
                    </span>
                  </span>
                  <span className={`chip ${injuryStatusTone[i.status]}`}>{injuryStatusLabel[i.status]}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(sessionsRes.data ?? []).length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-orc-muted">Últimas sesiones</h2>
          <ul className="card divide-y divide-orc-line p-0">
            {(sessionsRes.data ?? []).map((s) => (
              <li key={s.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span>
                  <span className="font-semibold">{s.title ?? sessionTypeLabel[s.session_type]}</span>
                  <span className="block text-xs text-orc-muted">{catName.get(s.category_id)}</span>
                </span>
                <span className="text-orc-muted">{formatDate(s.session_date)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex items-center justify-between rounded-xl bg-orc-black px-4 py-3 text-white md:hidden">
        <span className="text-sm">
          {profile?.full_name} · <span className="text-white/60">{roleLabel[profile?.role ?? ""]}</span>
        </span>
        <LogoutButton />
      </section>
    </div>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="card mx-auto mt-10 max-w-md text-center">
      <h1 className="text-lg font-bold">{title}</h1>
      <p className="mt-2 text-orc-muted">{text}</p>
    </div>
  );
}
