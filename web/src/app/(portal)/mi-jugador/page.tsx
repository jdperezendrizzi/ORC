import type { Metadata } from "next";
import { ObjectiveStatusChip } from "@/components/objective-status-chip";
import { TRACKED_METRICS } from "@/lib/alerts";
import { attendancePct, countByStatus, type AttendanceRow } from "@/lib/attendance";
import { fetchAll } from "@/lib/fetch-all";
import { formatDate } from "@/lib/labels";
import { objectiveAreaLabel, objectiveState, playerProgress, progress } from "@/lib/objectives";
import { seasonImprovement } from "@/lib/promotion";
import { getViewer } from "@/lib/server-data";
import type { Objective, ObjectiveCheck } from "@/lib/types";
import { ageOn, clubToday, formatValue } from "@/lib/validation";

export const metadata: Metadata = { title: "Mi jugador" };
export const dynamic = "force-dynamic";

export default async function MyPlayerPage({ searchParams }: { searchParams: Promise<{ j?: string }> }) {
  const { j } = await searchParams;
  const { supabase, season, profile } = await getViewer();
  // La base sólo devuelve los jugadores que le corresponden (y con el consentimiento).
  const { data: mine } = await supabase.from("players").select("id, first_name, last_name, birth_date").order("first_name");
  const players = mine ?? [];

  if (players.length === 0) {
    return (
      <div className="card space-y-2">
        <h1 className="text-xl font-black">Hola, {profile?.full_name?.split(" ")[0]}</h1>
        <p className="text-sm text-orc-muted">
          Todavía no hay información para mostrar. Si sos tutor de un menor, el club tiene que registrar el consentimiento
          «Acceso de la familia». Consultá con el club.
        </p>
      </div>
    );
  }
  const player = players.find((p) => p.id === j) ?? players[0];
  const today = clubToday();

  const [pscRes, attendance, objRes, checksRes, metricsRes, bestRes] = await Promise.all([
    supabase
      .from("player_season_categories")
      .select("jersey_number, position:positions(name), category:categories(id, name)")
      .eq("player_id", player.id)
      .eq("season_id", season?.id ?? "00000000-0000-0000-0000-000000000000")
      .maybeSingle(),
    season
      ? fetchAll<AttendanceRow>(
          () =>
            supabase
              .from("attendance")
              .select("id, player_id, category_id, season_id, att_date, kind, status, note")
              .eq("player_id", player.id)
              .eq("season_id", season.id)
              .order("att_date", { ascending: false }) as never,
        )
      : Promise.resolve([] as AttendanceRow[]),
    supabase.from("objectives").select("id, category_id, scope, area, title, look_for, exercise_name, exercise_description, exercise_url, sort_order").order("sort_order"),
    supabase.from("objective_checks").select("id, objective_id, season_id, check_date, player_id, achieved, status, note").eq("season_id", season?.id ?? ""),
    supabase.from("test_metrics").select("id, code, name, unit, decimals, higher_is_better, sort_order").in("code", [...TRACKED_METRICS]).order("sort_order"),
    supabase
      .from("v_session_best")
      .select("metric_id, session_date, value")
      .eq("player_id", player.id)
      .eq("season_id", season?.id ?? "")
      .order("session_date"),
  ]);

  type Psc = { jersey_number: number | null; position: { name: string } | null; category: { id: string; name: string } | null };
  const psc = pscRes.data as unknown as Psc | null;
  const att = countByStatus(attendance);
  const attPct = attendancePct(attendance);
  const absences = attendance.filter((a) => a.status !== "present").slice(0, 5);

  const objectives = ((objRes.data ?? []) as Objective[]).filter((o) => o.category_id === psc?.category?.id);
  const checks = (checksRes.data ?? []) as ObjectiveCheck[];
  const playerObjs = objectives.filter((o) => o.scope === "player");
  const teamObjs = objectives.filter((o) => o.scope === "team");

  type M = { id: string; code: string; name: string; unit: string; decimals: number; higher_is_better: boolean };
  const metrics = ((metricsRes.data ?? []) as M[]).map((m) => {
    const pts = (bestRes.data ?? []).filter((r) => r.metric_id === m.id).map((r) => ({ date: r.session_date as string, value: Number(r.value) }));
    if (pts.length === 0) return null;
    const values = pts.map((p) => p.value);
    const best = m.higher_is_better ? Math.max(...values) : Math.min(...values);
    const improvement = pts.length >= 2 ? seasonImprovement(pts[0].value, pts[pts.length - 1].value, m.higher_is_better) : null;
    return { ...m, decimals: Number(m.decimals), best, last: pts[pts.length - 1], count: pts.length, improvement };
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  return (
    <div className="space-y-5">
      {players.length > 1 && (
        <nav className="flex gap-2 overflow-x-auto" aria-label="Jugadores">
          {players.map((p) => (
            <a
              key={p.id}
              href={`/mi-jugador?j=${p.id}`}
              aria-current={p.id === player.id ? "page" : undefined}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold ${p.id === player.id ? "border-orc-orange bg-orc-orange text-orc-black" : "border-orc-line-strong bg-orc-surface"}`}
            >
              {p.first_name}
            </a>
          ))}
        </nav>
      )}

      <header className="overflow-hidden rounded-xl bg-orc-black text-white">
        <div className="flex items-center gap-4 p-4">
          <span className="grid size-16 shrink-0 place-items-center rounded-full border-2 border-orc-orange text-2xl font-black">
            {psc?.jersey_number ?? "–"}
          </span>
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-black leading-tight">
              {player.first_name} {player.last_name}
            </h1>
            <p className="text-sm text-white/70">
              {ageOn(player.birth_date as string, today)} años · {psc?.category?.name ?? "Sin categoría"}
              {psc?.position ? ` · ${psc.position.name}` : ""}
            </p>
            <p className="text-xs text-white/50">Temporada {season?.name}</p>
          </div>
        </div>
      </header>

      <section className="card space-y-2" aria-label="Asistencia">
        <h2 className="font-bold">Asistencia</h2>
        {attendance.length === 0 ? (
          <p className="text-sm text-orc-muted">Todavía no hay asistencia registrada.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="text-3xl font-black tabular-nums">{attPct ?? "—"}%</span>
              <span className="text-sm text-orc-muted">
                {att.present} {att.present === 1 ? "presente" : "presentes"} · {att.absent} {att.absent === 1 ? "ausente" : "ausentes"} ·{" "}
                {att.excused} {att.excused === 1 ? "justificada" : "justificadas"}
              </span>
            </div>
            {absences.length > 0 && (
              <p className="text-sm text-orc-muted">
                Últimas faltas: {absences.map((a) => `${formatDate(a.att_date)}${a.status === "excused" ? " (justificada)" : ""}`).join(" · ")}
              </p>
            )}
          </>
        )}
      </section>

      {(playerObjs.length > 0 || teamObjs.length > 0) && (
        <section className="card space-y-2" aria-label="Objetivos">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-bold">{playerObjs.length ? "Objetivos" : "Objetivos del equipo"}</h2>
            <span className="text-sm">
              {(() => {
                const p = playerObjs.length ? playerProgress(playerObjs, checks, player.id, today) : progress(teamObjs, checks, today);
                return (
                  <>
                    <b className="text-lg tabular-nums">{p.done}</b> de {p.total} logrados
                  </>
                );
              })()}
            </span>
          </div>
          <ul className="divide-y divide-orc-line">
            {(playerObjs.length ? playerObjs : teamObjs).map((o) => {
              const st = objectiveState(checks, o.id, today, playerObjs.length ? player.id : null);
              return (
                <li key={o.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                  <span>
                    <span className="font-semibold">{o.title}</span>
                    <span className="block text-xs text-orc-muted">{objectiveAreaLabel[o.area]}</span>
                  </span>
                  <ObjectiveStatusChip status={st.status} />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="card space-y-2" aria-label="Evolución física">
        <h2 className="font-bold">Evolución física</h2>
        {metrics.length === 0 ? (
          <p className="text-sm text-orc-muted">Todavía no hay tests físicos esta temporada.</p>
        ) : (
          <ul className="divide-y divide-orc-line">
            {metrics.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-sm">
                <span>
                  <span className="font-semibold">{m.name}</span>
                  <span className="block text-xs text-orc-muted">
                    Mejor marca: {formatValue(m.best, m.decimals)} {m.unit} · última: {formatValue(m.last.value, m.decimals)} {m.unit} ({formatDate(m.last.date)})
                  </span>
                </span>
                {m.improvement !== null && (
                  <span className={`chip shrink-0 text-xs ${m.improvement >= 0 ? "tone-green" : "tone-amber"}`}>
                    {m.improvement >= 0 ? "Mejoró" : "Bajó"} {formatValue(Math.abs(m.improvement), 1)} %
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-center text-xs text-orc-muted">Solo lectura. Para cualquier consulta, hablá con el cuerpo técnico.</p>
    </div>
  );
}
