import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { computeAlerts } from "@/lib/alerts";
import { loadAlertInput } from "@/lib/alerts-server";
import type { AttendanceRow } from "@/lib/attendance";
import { LOW_PCT } from "@/lib/attendance-report";
import { loadDashboard } from "@/lib/dashboard-server";
import { fetchAll } from "@/lib/fetch-all";
import { formatDate } from "@/lib/labels";
import { canEdit, canView } from "@/lib/modules";
import { getViewer, getViewerCategories, isStaff } from "@/lib/server-data";
import { ATTENDANCE_DAYS, buildTeamReport, teamReportText, WELLNESS_DAYS } from "@/lib/team-report";
import { clubToday, formatValue } from "@/lib/validation";
import { TeamShare } from "./team-share";

export const metadata: Metadata = { title: "Estado del equipo" };
export const dynamic = "force-dynamic";

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Estado del equipo de una categoría (lo del Inicio), para compartir. */
export default async function TeamStatePage({ searchParams }: { searchParams: Promise<{ categoria?: string }> }) {
  const { supabase, season, profile, modules } = await getViewer();
  if (!season || !isStaff(profile)) notFound();
  const categories = await getViewerCategories();
  const { categoria } = await searchParams;
  const category = categories.find((c) => c.id === categoria) ?? categories[0];
  if (!category) notFound();
  const today = clubToday();
  const see = {
    perf: canView(modules, "performance"),
    inj: canView(modules, "injuries"),
    att: canView(modules, "attendance"),
    well: canView(modules, "wellness"),
    alerts: canView(modules, "insights"),
  };

  const roster = await fetchAll<{ player: { id: string; first_name: string; last_name: string; active: boolean } }>(
    () =>
      supabase
        .from("player_season_categories")
        .select("id, player:players!inner(id, first_name, last_name, active)")
        .eq("season_id", season.id)
        .eq("category_id", category.id)
        .order("id") as never,
  );
  const players = roster
    .filter((r) => r.player.active)
    .map((r) => ({ id: r.player.id, name: `${r.player.last_name}, ${r.player.first_name}` }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const ids = players.map((p) => p.id);
  const none = ["00000000-0000-0000-0000-000000000000"];

  const dashboard = see.perf || see.alerts ? await loadDashboard(supabase, season, [category]) : undefined;
  const [injRes, consRes, attendance, wellRes, alertInput] = await Promise.all([
    see.inj
      ? supabase.from("injuries").select("player_id, status, expected_return").in("player_id", ids.length ? ids : none).neq("status", "closed").is("deleted_at", null)
      : Promise.resolve({ data: null }),
    supabase.from("consents").select("player_id").eq("consent_type", "performance_data").is("revoked_at", null).in("player_id", ids.length ? ids : none),
    see.att
      ? fetchAll<AttendanceRow>(
          () =>
            supabase
              .from("attendance")
              .select("id, player_id, category_id, season_id, att_date, kind, status, note")
              .eq("category_id", category.id)
              .gte("att_date", addDays(today, -(ATTENDANCE_DAYS - 1)))
              .order("id") as never,
        )
      : Promise.resolve(undefined),
    see.well
      ? supabase
          .from("wellness_logs")
          .select("player_id, log_date, wellness_score")
          .in("player_id", ids.length ? ids : none)
          .gte("log_date", addDays(today, -(WELLNESS_DAYS - 1)))
          .is("deleted_at", null)
      : Promise.resolve({ data: null }),
    see.alerts && dashboard ? loadAlertInput(supabase, season, [category], dashboard) : Promise.resolve(null),
  ]);
  const withConsent = new Set((consRes.data ?? []).map((c) => c.player_id as string));

  const report = buildTeamReport({
    categoryId: category.id,
    categoryName: category.name,
    seasonName: season.name,
    today,
    players,
    injuries: (injRes.data as { player_id: string; status: string; expected_return: string | null }[] | null) ?? undefined,
    noConsent: players.filter((p) => !withConsent.has(p.id)).length,
    attendance,
    alerts: alertInput ? computeAlerts(alertInput) : undefined,
    dashboard: see.perf ? dashboard : undefined,
    wellness: (wellRes.data as { player_id: string; log_date: string; wellness_score: number | null }[] | null)?.map((w) => ({
      ...w,
      wellness_score: w.wellness_score === null ? null : Number(w.wellness_score),
    })),
  });
  const text = teamReportText(report);

  return (
    <div className="space-y-4">
      <div>
        <Link href="/plantel" className="text-sm font-semibold text-orc-orange-strong">
          ← Plantel
        </Link>
        <h1 className="text-2xl font-black">Estado del equipo</h1>
        <p className="text-sm text-orc-muted">
          {category.name} · {formatDate(today, { day: "numeric", month: "long" })}
        </p>
      </div>

      {categories.length > 1 && (
        <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="Categoría">
          {categories.map((c) => (
            <Link
              key={c.id}
              href={`/plantel/estado?categoria=${c.id}`}
              aria-current={c.id === category.id ? "page" : undefined}
              className={`opt shrink-0 px-4 py-2 text-sm ${c.id === category.id ? "border-orc-orange bg-orc-orange font-black text-orc-black" : ""}`}
            >
              {c.code}
            </Link>
          ))}
        </nav>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Resumen">
        <Big n={String(report.total)} label="jugadores" />
        {report.available !== null && <Big n={String(report.available)} label="disponibles" />}
        {report.attendance && <Big n={report.attendance.pct === null ? "—" : `${report.attendance.pct} %`} label={`asistencia ${ATTENDANCE_DAYS} días`} />}
        {report.wellness && <Big n={report.wellness.avg === null ? "—" : formatValue(report.wellness.avg, 1)} label={`bienestar /25 (${WELLNESS_DAYS} días)`} />}
      </section>

      {report.injured && (
        <Section title="Lesionados">
          {report.injured.length === 0 ? (
            <p className="text-sm text-orc-muted">Nadie lesionado.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {report.injured.map((x) => (
                <li key={x.name}>
                  <b>{x.name}</b>: {x.status.toLowerCase()}
                  {x.back && ` · vuelve aprox. ${formatDate(x.back)}`}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {report.alerts && (
        <Section title="Para mirar">
          {report.alerts.length === 0 ? (
            <p className="text-sm text-orc-muted">Sin alertas.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {report.alerts.map((a, k) => (
                <li key={k}>
                  <span className={`chip mr-1 text-xs ${a.severity === "alta" ? "tone-red" : "tone-amber"}`}>
                    {a.severity === "alta" ? "⛔" : "⚠"} {a.label}
                  </span>
                  <b>{a.name}</b>: {a.detail}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {report.attendance && (
        <Section title={`Asistencia (últimos ${ATTENDANCE_DAYS} días)`}>
          {report.attendance.sessions === 0 ? (
            <p className="text-sm text-orc-muted">No se tomó asistencia.</p>
          ) : (
            <div className="space-y-1 text-sm">
              <p>
                {report.attendance.pct ?? "—"} % en {report.attendance.sessions} días · prácticas {report.attendance.practicePct ?? "—"} % · partidos{" "}
                {report.attendance.matchPct ?? "—"} %
              </p>
              {report.attendance.low.length > 0 && (
                <p>
                  <span aria-hidden>⚠ </span>Menos de {LOW_PCT} %: {report.attendance.low.map((x) => `${x.name} (${x.pct} %)`).join(", ")}
                </p>
              )}
            </div>
          )}
        </Section>
      )}

      {report.tests && (
        <Section title="Tests (promedio del último testeo)">
          {report.tests.length === 0 ? (
            <p className="text-sm text-orc-muted">Sin tests en la temporada.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {report.tests.map((t) => (
                <li key={t.label}>
                  <b>{t.label}</b>: {t.value} {t.unit}
                  {t.change && (
                    <span className={t.improved === true ? "text-green-700 dark:text-green-400" : t.improved === false ? "text-red-700 dark:text-red-400" : ""}>
                      {" "}
                      ({t.improved === true ? "✓ mejoró" : t.improved === false ? "✕ empeoró" : "="} {t.change})
                    </span>
                  )}
                  <span className="text-orc-muted">
                    {" "}
                    · {t.n} jugadores{t.date && `, ${formatDate(t.date)}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      <TeamShare report={report} text={text} categoryId={category.id} canShare={canEdit(modules, "sharing")} />
    </div>
  );
}

function Big({ n, label }: { n: string; label: string }) {
  return (
    <div className="card p-3">
      <p className="text-2xl font-black tabular-nums">{n}</p>
      <p className="text-xs text-orc-muted">{label}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-2">
      <h2 className="font-bold">{title}</h2>
      {children}
    </section>
  );
}
