import { notFound } from "next/navigation";
import { getViewer } from "@/lib/server-data";
import { formatDate, injuryStatusLabel, injuryStatusTone, sessionTypeLabel } from "@/lib/labels";
import { ageOn, formatValue } from "@/lib/validation";
import type { Category, Position } from "@/lib/types";

export const dynamic = "force-dynamic";

// Métricas resumen del plantel (mejor marca de la temporada).
const SUMMARY_METRICS = [
  { code: "sprint_10m_s", label: "10 m", decimals: 2 },
  { code: "cmj_height_cm", label: "CMJ", decimals: 1 },
  { code: "yoyo_ir1_distance_m", label: "Yo-Yo", decimals: 0 },
  { code: "back_squat_1rm_kg", label: "Sentadilla", decimals: 0 },
] as const;

export default async function CategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, season } = await getViewer();
  if (!season) notFound();

  const { data: category } = await supabase
    .from("categories")
    .select("id, code, name, level, sort_order")
    .eq("id", id)
    .maybeSingle<Category>();
  if (!category) notFound();

  const [rosterRes, positionsRes, metricsRes, injuriesRes, consentsRes, sessionsRes] = await Promise.all([
    supabase
      .from("player_season_categories")
      .select("position_id, jersey_number, player:players!inner(id, first_name, last_name, birth_date, primary_position_id)")
      .eq("season_id", season.id)
      .eq("category_id", id),
    supabase.from("positions").select("id, name, short_name, unit, line"),
    supabase.from("test_metrics").select("id, code").in("code", SUMMARY_METRICS.map((m) => m.code)),
    supabase.from("injuries").select("player_id, status").neq("status", "closed").is("deleted_at", null),
    supabase.from("consents").select("player_id, consent_type").is("revoked_at", null),
    supabase
      .from("evaluation_sessions")
      .select("id, session_type, session_date, title")
      .eq("category_id", id)
      .is("deleted_at", null)
      .order("session_date", { ascending: false })
      .limit(10),
  ]);

  type Row = {
    position_id: number | null;
    jersey_number: number | null;
    player: { id: string; first_name: string; last_name: string; birth_date: string; primary_position_id: number | null };
  };
  const roster = ((rosterRes.data ?? []) as unknown as Row[])
    .map((r) => ({ ...r, position_id: r.position_id ?? r.player.primary_position_id }))
    .sort((a, b) => (a.position_id ?? 99) - (b.position_id ?? 99) || a.player.last_name.localeCompare(b.player.last_name));
  const positions = new Map(((positionsRes.data ?? []) as Position[]).map((p) => [p.id, p]));
  const metricIdByCode = new Map((metricsRes.data ?? []).map((m) => [m.code as string, m.id as string]));
  const playerIds = roster.map((r) => r.player.id);

  const { data: bests } = playerIds.length
    ? await supabase
        .from("v_player_season_best")
        .select("player_id, metric_code, value")
        .eq("season_id", season.id)
        .in("player_id", playerIds)
        .in("metric_id", [...metricIdByCode.values()])
    : { data: [] };
  const best = new Map((bests ?? []).map((b) => [`${b.player_id}:${b.metric_code}`, Number(b.value)]));
  const injury = new Map((injuriesRes.data ?? []).map((i) => [i.player_id as string, i.status as string]));
  const consents = consentsRes.data ?? [];
  const has = (pid: string, type: string) => consents.some((c) => c.player_id === pid && c.consent_type === type);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <a href="/" className="text-sm text-orc-muted">
            ← Inicio
          </a>
          <h1 className="text-2xl font-black">{category.name}</h1>
          <p className="text-sm text-orc-muted">
            {roster.length} jugadores · temporada {season.name}
          </p>
        </div>
        <a href={`/cargar?categoria=${category.id}`} className="btn-primary">
          + Cargar
        </a>
      </header>

      <section className="card overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-orc-black text-left text-xs uppercase tracking-wide text-white">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Jugador</th>
              <th className="px-3 py-2">Puesto</th>
              <th className="px-3 py-2">Edad</th>
              {SUMMARY_METRICS.map((m) => (
                <th key={m.code} className="px-3 py-2 text-right">
                  {m.label}
                </th>
              ))}
              <th className="px-3 py-2">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-orc-line">
            {roster.map((r) => {
              const pid = r.player.id;
              const status = injury.get(pid);
              return (
                <tr key={pid} className="hover:bg-orc-orange-soft">
                  <td className="px-3 py-2 tabular-nums text-orc-muted">{r.jersey_number ?? "—"}</td>
                  <td className="px-3 py-2">
                    <a href={`/jugadores/${pid}`} className="whitespace-nowrap font-semibold hover:underline">
                      {r.player.last_name}, {r.player.first_name}
                    </a>
                  </td>
                  <td className="px-3 py-2">{r.position_id ? positions.get(r.position_id)?.short_name : "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{ageOn(r.player.birth_date)}</td>
                  {SUMMARY_METRICS.map((m) => (
                    <td key={m.code} className="px-3 py-2 text-right tabular-nums">
                      {formatValue(best.get(`${pid}:${m.code}`), m.decimals)}
                    </td>
                  ))}
                  <td className="space-x-1 px-3 py-2 whitespace-nowrap">
                    {status && <span className={`chip ${injuryStatusTone[status]}`}>{injuryStatusLabel[status]}</span>}
                    {!has(pid, "performance_data") && (
                      <span className="chip tone-amber" title="Sin consentimiento de datos de rendimiento">
                        Sin consent.
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="border-t border-orc-line px-3 py-2 text-xs text-orc-muted">
          Mejor marca de cada jugador en la temporada. <b>10 m</b>: sprint en segundos (menos es mejor) ·{" "}
          <b>CMJ</b>: salto en cm (potencia) · <b>Yo-Yo</b>: metros en el test de resistencia ·{" "}
          <b>Sentadilla</b>: 1RM en kg (fuerza de piernas). Tocá un jugador para ver su evolución.{" "}
          <a href="/guia" className="font-semibold text-orc-orange-strong">
            Qué significa cada dato →
          </a>
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-orc-muted">Sesiones</h2>
        <ul className="card divide-y divide-orc-line p-0">
          {(sessionsRes.data ?? []).map((s) => (
            <li key={s.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <span>
                <span className="font-semibold">{s.title ?? sessionTypeLabel[s.session_type]}</span>
                <span className="ml-2 text-xs text-orc-muted">{sessionTypeLabel[s.session_type]}</span>
              </span>
              <span className="flex items-center gap-3">
                <span className="text-orc-muted">{formatDate(s.session_date)}</span>
                <a href={`/cargar?sesion=${s.id}`} className="font-semibold text-orc-orange-strong">
                  Abrir
                </a>
              </span>
            </li>
          ))}
          {(sessionsRes.data ?? []).length === 0 && <li className="px-4 py-3 text-sm text-orc-muted">Sin sesiones.</li>}
        </ul>
      </section>
    </div>
  );
}
