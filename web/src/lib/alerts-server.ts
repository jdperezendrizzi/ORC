import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "./fetch-all";
import { addDays, type AlertInput, type InjuryPoint, type WellnessPoint } from "./alerts";
import type { AttendanceRow } from "./attendance";
import type { DashboardData } from "./dashboard";
import { loadDashboard } from "./dashboard-server";
import type { Category, Season } from "./types";
import { clubToday } from "./validation";
import { DEFAULT_PARAMS, withDefaults } from "./field-tests/protocol";

/** Datos para alertas y resumen semanal (respeta RLS: sólo lo que ve el usuario). */
export async function loadAlertInput(
  supabase: SupabaseClient,
  season: Season,
  categories: Category[],
  dashboard?: DashboardData,
): Promise<AlertInput> {
  const today = clubToday();
  const since = addDays(today, -41); // 28 días de carga + 2 semanas de comparación
  const cmjSince = addDays(today, -(DEFAULT_PARAMS.cmj.weekly.baseline_days + 8));
  const [dash, wellness, injuries, attendance, cmjType] = await Promise.all([
    dashboard ?? loadDashboard(supabase, season, categories),
    fetchAll<WellnessPoint>(
      () =>
        supabase
          .from("wellness_logs")
          .select("player_id, log_date, wellness_score, srpe_load")
          .gte("log_date", since)
          .is("deleted_at", null)
          .order("id") as never,
    ),
    fetchAll<InjuryPoint>(
      () =>
        supabase
          .from("injuries")
          .select("id, player_id, status, occurred_on, expected_return, actual_return")
          .is("deleted_at", null)
          .order("id") as never,
    ),
    fetchAll<AttendanceRow>(
      () =>
        supabase
          .from("attendance")
          .select("id, player_id, category_id, season_id, att_date, kind, status, note")
          .eq("season_id", season.id)
          .gte("att_date", since)
          .in("category_id", categories.map((c) => c.id))
          .order("id") as never,
    ),
    supabase.from("test_types").select("id").eq("code", "cmj").maybeSingle(),
  ]);
  // CMJ semanal: saltos recientes (con su método) y parámetros del protocolo vigente
  const cmjMetric = dash.metrics.find((m) => m.code === "cmj_height_cm");
  const [cmjRows, cmjProtocol] = await Promise.all([
    cmjMetric
      ? fetchAll<{ player_id: string; value: number; method: string; session: { session_date: string } | null }>(
          () =>
            supabase
              .from("results")
              .select("id, player_id, value, method, session:evaluation_sessions!inner(session_date)")
              .eq("metric_id", cmjMetric.id)
              .is("deleted_at", null)
              .gte("recorded_at", `${cmjSince}T00:00:00Z`)
              .order("id") as never,
        ).catch(() => [])
      : Promise.resolve([]),
    cmjType.data
      ? supabase.from("test_protocols").select("params").eq("active", true).eq("test_type_id", cmjType.data.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const categoryIds = new Set(categories.map((c) => c.id));
  const players = dash.players
    .filter((p) => categoryIds.has(p.categoryId))
    .map((p) => ({ id: p.id, name: p.name, categoryId: p.categoryId }));
  const ids = new Set(players.map((p) => p.id));
  return {
    today,
    players,
    metrics: dash.metrics,
    points: dash.points.filter((p) => ids.has(p[0])),
    wellness: wellness.map((w) => ({ ...w, wellness_score: w.wellness_score === null ? null : Number(w.wellness_score), srpe_load: w.srpe_load === null ? null : Number(w.srpe_load) })).filter((w) => ids.has(w.player_id)),
    injuries: injuries.filter((i) => ids.has(i.player_id)),
    attendance: attendance.filter((a) => ids.has(a.player_id)),
    cmj: cmjRows
      .filter((r) => r.session && ids.has(r.player_id) && r.session.session_date >= cmjSince)
      .map((r) => ({ player_id: r.player_id, date: r.session!.session_date, value: Number(r.value), method: r.method })),
    cmjWeekly: withDefaults("cmj", (cmjProtocol.data as { params?: unknown } | null)?.params).weekly,
  };
}
