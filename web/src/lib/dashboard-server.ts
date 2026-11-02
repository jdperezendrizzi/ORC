import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "./fetch-all";
import type { DashboardData, DashMetric, DashPlayer, DashPoint } from "./dashboard";
import type { Category, Season } from "./types";

// Métricas que no se grafican (insumos o datos derivados de salud).
const HIDDEN = new Set(["back_squat_load_kg", "back_squat_reps", "bench_press_load_kg", "bench_press_reps", "deadlift_load_kg", "deadlift_reps", "sitting_height_cm", "maturity_offset", "yoyo_ir1_level"]);

/** Datos del panel para las categorías que ve el usuario (respeta RLS). */
export async function loadDashboard(supabase: SupabaseClient, season: Season, categories: Category[]): Promise<DashboardData> {
  const categoryIds = categories.map((c) => c.id);
  const [roster, metricsRes, positionsRes, sessionBest] = await Promise.all([
    fetchAll<{ category_id: string; position_id: number | null; player: { id: string; first_name: string; last_name: string; primary_position_id: number | null; active: boolean } }>(
      () =>
        supabase
          .from("player_season_categories")
          .select("category_id, position_id, player:players!inner(id, first_name, last_name, primary_position_id, active)")
          .eq("season_id", season.id)
          .in("category_id", categoryIds)
          .order("id") as never,
    ),
    supabase
      .from("test_metrics")
      .select("id, code, name, unit, decimals, higher_is_better, sort_order, test_type:test_types(domain, sort_order)")
      .eq("active", true),
    supabase.from("positions").select("id, short_name, unit"),
    fetchAll<{ player_id: string; metric_id: string; session_date: string; value: number }>(
      () =>
        supabase
          .from("v_session_best")
          .select("player_id, metric_id, session_date, value")
          .eq("season_id", season.id)
          .order("session_id")
          .order("player_id")
          .order("metric_id") as never,
    ),
  ]);

  const positions = new Map((positionsRes.data ?? []).map((p) => [p.id as number, { short: p.short_name as string, unit: p.unit as "forwards" | "backs" }]));
  const players: DashPlayer[] = roster
    .filter((r) => r.player.active)
    .map((r) => {
      const pos = positions.get((r.position_id ?? r.player.primary_position_id) as number);
      return {
        id: r.player.id,
        name: `${r.player.last_name}, ${r.player.first_name}`,
        categoryId: r.category_id,
        unit: pos?.unit ?? null,
        position: pos?.short ?? null,
      };
    });
  const ids = new Set(players.map((p) => p.id));

  type M = { id: string; code: string; name: string; unit: string; decimals: number; higher_is_better: boolean; sort_order: number; test_type: { domain: string; sort_order: number } };
  const metrics: DashMetric[] = ((metricsRes.data ?? []) as unknown as M[])
    .filter((m) => !HIDDEN.has(m.code))
    .sort((a, b) => a.test_type.sort_order - b.test_type.sort_order || a.sort_order - b.sort_order)
    .map((m) => ({
      id: m.id,
      code: m.code,
      name: m.name,
      unit: m.unit,
      decimals: m.decimals,
      higherIsBetter: m.higher_is_better,
      domain: m.test_type.domain,
    }));
  const metricIds = new Set(metrics.map((m) => m.id));

  const points: DashPoint[] = sessionBest
    .filter((r) => ids.has(r.player_id) && metricIds.has(r.metric_id))
    .map((r) => [r.player_id, r.metric_id, r.session_date, Number(r.value)]);

  return { categories: categories.map((c) => ({ id: c.id, name: c.name })), players, metrics, points };
}
