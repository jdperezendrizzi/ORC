import { canEdit, canView } from "@/lib/modules";
import { TeamDashboard } from "@/components/team-dashboard";
import { loadDashboard } from "@/lib/dashboard-server";
import { AlertsList } from "@/components/alerts-list";
import { computeAlerts } from "@/lib/alerts";
import { loadAlertInput } from "@/lib/alerts-server";
import { canLoadResults, getTeamObjectiveCategoryIds, getViewer, getViewerCategories, isInfantileCoach, isStaff } from "@/lib/server-data";
import { progress } from "@/lib/objectives";
import type { Objective, ObjectiveCheck } from "@/lib/types";
import { fetchAll } from "@/lib/fetch-all";
import { clubToday } from "@/lib/validation";
import { formatDate, injuryStatusLabel, injuryStatusTone, sessionTypeLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { supabase, profile, season, modules } = await getViewer();
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

  // «Práctica de hoy»: para el profe, asistencia y objetivos del día por categoría
  const showPractice = profile?.role === "coach" && canLoadResults(profile) && (canView(modules, "attendance") || canView(modules, "objectives"));
  const today = clubToday();
  // Profe de infantiles: no hace tests físicos, la práctica de hoy va primero
  const infantile = await isInfantileCoach();
  const teamCats = showPractice ? await getTeamObjectiveCategoryIds() : new Set<string>();
  const [attToday, objRes, objChecks] = showPractice
    ? await Promise.all([
        canView(modules, "attendance")
          ? supabase.from("attendance").select("player_id, category_id").eq("att_date", today).in("category_id", categoryIds)
          : Promise.resolve({ data: [] as { player_id: string; category_id: string }[] }),
        canView(modules, "objectives")
          ? supabase.from("objectives").select("id, category_id, scope, area, title, sort_order").eq("active", true).in("category_id", categoryIds)
          : Promise.resolve({ data: [] as Objective[] }),
        canView(modules, "objectives")
          ? fetchAll<ObjectiveCheck>(
              () =>
                supabase
                  .from("objective_checks")
                  .select("id, objective_id, season_id, check_date, player_id, achieved, note")
                  .eq("season_id", season.id)
                  .order("id") as never,
            )
          : Promise.resolve([] as ObjectiveCheck[]),
      ])
    : [{ data: [] }, { data: [] }, [] as ObjectiveCheck[]];
  const practice = showPractice
    ? categories.map((c) => {
        const players = (rosterRes.data ?? []).filter((r) => r.category_id === c.id).length;
        const taken = new Set(((attToday.data ?? []) as { player_id: string; category_id: string }[]).filter((a) => a.category_id === c.id).map((a) => a.player_id)).size;
        const objs = ((objRes.data ?? []) as Objective[]).filter((o) => o.category_id === c.id);
        const ids = new Set(objs.map((o) => o.id));
        const checks = (objChecks as ObjectiveCheck[]).filter((k) => ids.has(k.objective_id));
        const markedToday = checks.some((k) => k.check_date === today);
        return {
          category: c,
          players,
          taken,
          team: teamCats.has(c.id),
          objectives: objs.length ? (teamCats.has(c.id) ? progress(objs, checks, today) : { done: 0, total: objs.length }) : null,
          markedToday,
        };
      })
    : [];

  const dashboard = await loadDashboard(supabase, season, categories);
  const showAlerts = isStaff(profile) && canView(modules, "insights");
  const alerts = showAlerts ? computeAlerts(await loadAlertInput(supabase, season, categories, dashboard)) : [];
  const playerNames = new Map(dashboard.players.map((p) => [p.id, p.name]));
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

      {canLoadResults(profile) && (canEdit(modules, "performance") || canEdit(modules, "wellness")) && (
        <section className={`grid gap-3 ${canEdit(modules, "performance") && !infantile && canEdit(modules, "wellness") ? "grid-cols-2" : "grid-cols-1"}`}>
          {canEdit(modules, "performance") && !infantile && (
            <a href="/cargar" className="btn-primary h-16 text-base">
              + Cargar evaluación
            </a>
          )}
          {canEdit(modules, "wellness") && (
            <a href="/bienestar" className="btn-dark h-16 text-base">
              Bienestar del día
            </a>
          )}
        </section>
      )}

      {practice.length > 0 && (
        <section className="space-y-2" aria-label="Práctica de hoy">
          <h2 className="text-sm font-bold uppercase tracking-wide text-orc-muted">Práctica de hoy</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {practice.map((p) => (
              <li key={p.category.id} className="card space-y-3">
                <p className="font-bold">{p.category.name}</p>
                {canView(modules, "attendance") && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm">
                      {p.taken > 0 ? (
                        <>
                          <span className="chip tone-green mr-1 text-xs">✓ Tomada</span>
                          Asistencia {p.taken} de {p.players}
                        </>
                      ) : (
                        <>
                          <span className="chip mr-1 text-xs">○ Pendiente</span>
                          Asistencia
                        </>
                      )}
                    </span>
                    <a href={`/practica?tab=asistencia&categoria=${p.category.id}`} className={`${p.taken > 0 ? "btn-ghost" : "btn-dark"} h-10 shrink-0 text-sm`}>
                      {p.taken > 0 ? "Ver" : "Tomar asistencia"}
                    </a>
                  </div>
                )}
                {canView(modules, "objectives") && p.objectives && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm">
                        {p.markedToday ? <span className="chip tone-green mr-1 text-xs">✓ Marcados hoy</span> : <span className="chip mr-1 text-xs">○ Sin marcar hoy</span>}
                        {p.team ? (
                          <>
                            Objetivos <b className="tabular-nums">{p.objectives.done}</b> de {p.objectives.total} logrados
                          </>
                        ) : (
                          <>Objetivos por jugador ({p.objectives.total})</>
                        )}
                      </span>
                      <a href={`/objetivos?categoria=${p.category.id}`} className={`${p.markedToday ? "btn-ghost" : "btn-primary"} h-10 shrink-0 text-sm`}>
                        {p.team ? "Tachar objetivos" : "Ver objetivos"}
                      </a>
                    </div>
                    {p.team && p.objectives.total > 0 && (
                      <div className="h-2 overflow-hidden rounded-full bg-orc-chip" aria-hidden>
                        <div className="h-full rounded-full bg-orc-orange" style={{ width: `${Math.round((p.objectives.done / p.objectives.total) * 100)}%` }} />
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {showAlerts && (
        <AlertsList
          alerts={alerts}
          names={playerNames}
          categoryNames={categories.length > 1 ? new Map(categories.map((c) => [c.id, c.name])) : undefined}
          visible={5}
        />
      )}

      {canView(modules, "performance") && <TeamDashboard data={dashboard} />}

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
                    <span className="text-sm text-orc-muted">{players.length} jugadores · resumen de la semana ›</span>
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
                <a href={`/lesiones/${i.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-orc-orange-soft">
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
