import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "./fetch-all";
import { addDays, type AlertInput, type InjuryPoint, type WellnessPoint } from "./alerts";
import type { AttendanceRow } from "./attendance";
import type { DashboardData } from "./dashboard";
import { loadDashboard } from "./dashboard-server";
import type { Category, Season } from "./types";
import { clubToday } from "./validation";

/** Datos para alertas y resumen semanal (respeta RLS: sólo lo que ve el usuario). */
export async function loadAlertInput(
  supabase: SupabaseClient,
  season: Season,
  categories: Category[],
  dashboard?: DashboardData,
): Promise<AlertInput> {
  const today = clubToday();
  const since = addDays(today, -41); // 28 días de carga + 2 semanas de comparación
  const [dash, wellness, injuries, attendance] = await Promise.all([
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
  };
}
