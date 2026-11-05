import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { TRACKED_METRICS } from "./alerts";
import { attendancePct, countByStatus, type AttendanceRow } from "./attendance";
import { fetchAll } from "./fetch-all";
import { progress } from "./objectives";
import { aboveMedianCount, nextCategory, seasonImprovement, standing, type Benchmark, type Outcome, type Standing } from "./promotion";
import type { Category, Objective, ObjectiveCheck, Season } from "./types";
import { clubToday } from "./validation";

export interface SheetMetric {
  id: string;
  code: string;
  name: string;
  unit: string;
  decimals: number;
  higherIsBetter: boolean;
  best: number | null;
  first: number | null;
  last: number | null;
  measurements: number;
  improvement: number | null;
  bench: Benchmark | null;
  benchGroup: "unit" | "category" | null;
  standing: Standing | null;
}

export interface Review {
  target_category_id: string | null;
  recommendation: Outcome | null;
  recommendation_note: string | null;
  recommended_at: string | null;
  recommender: { full_name: string } | null;
  decision: Outcome | null;
  decision_note: string | null;
  decided_at: string | null;
  decider: { full_name: string } | null;
}

const REVIEW_SELECT =
  "player_id, target_category_id, recommendation, recommendation_note, recommended_at, decision, decision_note, decided_at, recommender:profiles!promotion_reviews_recommended_by_fkey(full_name), decider:profiles!promotion_reviews_decided_by_fkey(full_name)";

type Metric = { id: string; code: string; name: string; unit: string; decimals: number; higher_is_better: boolean; sort_order: number };

async function trackedMetrics(supabase: SupabaseClient): Promise<Metric[]> {
  const { data } = await supabase
    .from("test_metrics")
    .select("id, code, name, unit, decimals, higher_is_better, sort_order")
    .in("code", [...TRACKED_METRICS])
    .order("sort_order");
  return ((data ?? []) as Metric[]).map((m) => ({ ...m, decimals: Number(m.decimals) }));
}

async function activeCategories(supabase: SupabaseClient): Promise<Category[]> {
  const { data } = await supabase.from("categories").select("id, code, name, level, sort_order").eq("active", true).order("sort_order");
  return (data ?? []) as Category[];
}

type BenchRow = { group_type: string; group_key: string; n: number; p25: number; p50: number; p75: number };

/** Referencias (agregadas, n ≥ 3) de la categoría destino, por métrica. */
async function benchmarks(supabase: SupabaseClient, seasonId: string, targetId: string, metricIds: string[]) {
  const out = new Map<string, BenchRow[]>();
  await Promise.all(
    metricIds.map(async (id) => {
      const { data } = await supabase.rpc("category_benchmarks", { p_season_id: seasonId, p_metric_id: id, p_category_id: targetId });
      out.set(
        id,
        ((data ?? []) as BenchRow[]).map((b) => ({ ...b, n: Number(b.n), p25: Number(b.p25), p50: Number(b.p50), p75: Number(b.p75) })),
      );
    }),
  );
  return out;
}

/** Misma unidad (forwards/backs) si alcanza; si no, toda la categoría. */
function pickBench(rows: BenchRow[] | undefined, unit: string | null): { bench: Benchmark; group: "unit" | "category" } | null {
  if (!rows) return null;
  const byUnit = unit ? rows.find((r) => r.group_type === "unit" && r.group_key === unit) : undefined;
  if (byUnit) return { bench: byUnit, group: "unit" };
  const cat = rows.find((r) => r.group_type === "category");
  return cat ? { bench: cat, group: "category" } : null;
}

function bestOf(values: number[], higherIsBetter: boolean): number | null {
  if (!values.length) return null;
  return higherIsBetter ? Math.max(...values) : Math.min(...values);
}

function sheetMetric(m: Metric, points: { session_date: string; value: number }[], benchRows: BenchRow[] | undefined, unit: string | null): SheetMetric {
  const sorted = [...points].sort((a, b) => a.session_date.localeCompare(b.session_date));
  const values = sorted.map((p) => p.value);
  const best = bestOf(values, m.higher_is_better);
  const first = sorted[0]?.value ?? null;
  const last = sorted[sorted.length - 1]?.value ?? null;
  const picked = pickBench(benchRows, unit);
  return {
    id: m.id,
    code: m.code,
    name: m.name,
    unit: m.unit,
    decimals: m.decimals,
    higherIsBetter: m.higher_is_better,
    best,
    first,
    last,
    measurements: sorted.length,
    improvement: sorted.length >= 2 && first !== null && last !== null ? seasonImprovement(first, last, m.higher_is_better) : null,
    bench: picked?.bench ?? null,
    benchGroup: picked?.group ?? null,
    standing: best !== null && picked ? standing(best, picked.bench, m.higher_is_better) : null,
  };
}

export interface PlayerSheet {
  player: { id: string; first_name: string; last_name: string };
  category: Category;
  unit: "forwards" | "backs" | null;
  target: Category | null;
  targetOptions: Category[];
  hasPerfConsent: boolean;
  attendance: { pct: number | null; present: number; absent: number; excused: number };
  objectives: { done: number; total: number } | null;
  injuries: { count: number; daysOut: number; active: boolean };
  metrics: SheetMetric[];
  review: Review | null;
}

/** Ficha de pase de un jugador (respeta RLS). */
export async function loadPlayerSheet(
  supabase: SupabaseClient,
  season: Season,
  playerId: string,
  targetId?: string,
): Promise<PlayerSheet | null> {
  const { data: psc } = await supabase
    .from("player_season_categories")
    .select("position_id, category:categories(id, code, name, level, sort_order), player:players!inner(id, first_name, last_name, primary_position_id)")
    .eq("player_id", playerId)
    .eq("season_id", season.id)
    .maybeSingle();
  if (!psc) return null;
  type P = {
    position_id: number | null;
    category: Category;
    player: { id: string; first_name: string; last_name: string; primary_position_id: number | null };
  };
  const row = psc as unknown as P;

  const [categories, metrics, seasonRes, positionsRes] = await Promise.all([
    activeCategories(supabase),
    trackedMetrics(supabase),
    supabase.from("seasons").select("starts_on, ends_on").eq("id", season.id).single(),
    supabase.from("positions").select("id, unit"),
  ]);
  const posId = row.position_id ?? row.player.primary_position_id;
  const unit = ((positionsRes.data ?? []).find((p) => p.id === posId)?.unit ?? null) as "forwards" | "backs" | null;
  const targetOptions = categories.filter((c) => c.sort_order > row.category.sort_order);
  const target = targetOptions.find((c) => c.id === targetId) ?? nextCategory(categories, row.category.id);

  const today = clubToday();
  const [points, attendance, objectivesRes, checks, injuriesRes, consentRes, reviewRes, bench] = await Promise.all([
    fetchAll<{ metric_id: string; session_date: string; value: number }>(
      () =>
        supabase
          .from("v_session_best")
          .select("metric_id, session_date, value")
          .eq("player_id", playerId)
          .eq("season_id", season.id)
          .order("session_date") as never,
    ),
    fetchAll<AttendanceRow>(
      () =>
        supabase
          .from("attendance")
          .select("id, player_id, category_id, season_id, att_date, kind, status, note")
          .eq("player_id", playerId)
          .eq("season_id", season.id)
          .order("id") as never,
    ),
    supabase.from("objectives").select("id, category_id, scope, area, title, sort_order").eq("category_id", row.category.id).eq("active", true),
    fetchAll<ObjectiveCheck>(
      () =>
        supabase
          .from("objective_checks")
          .select("id, objective_id, season_id, check_date, player_id, achieved, note")
          .eq("season_id", season.id)
          .order("id") as never,
    ),
    supabase
      .from("injuries")
      .select("status, occurred_on, days_lost")
      .eq("player_id", playerId)
      .is("deleted_at", null)
      .gte("occurred_on", (seasonRes.data?.starts_on as string) ?? "1900-01-01"),
    supabase.from("consents").select("consent_type").eq("player_id", playerId).eq("consent_type", "performance_data").is("revoked_at", null),
    supabase.from("promotion_reviews").select(REVIEW_SELECT).eq("player_id", playerId).eq("season_id", season.id).maybeSingle(),
    target ? benchmarks(supabase, season.id, target.id, metrics.map((m) => m.id)) : Promise.resolve(new Map<string, BenchRow[]>()),
  ]);

  const objectives = (objectivesRes.data ?? []) as Objective[];
  const injuries = (injuriesRes.data ?? []) as { status: string; occurred_on: string; days_lost: number | null }[];
  const att = attendance.filter((a) => a.category_id === row.category.id);
  const daysOut = injuries.reduce(
    (s, i) => s + (i.status === "closed" ? (i.days_lost ?? 0) : Math.max(0, Math.round((Date.parse(today) - Date.parse(i.occurred_on)) / 864e5))),
    0,
  );

  return {
    player: { id: row.player.id, first_name: row.player.first_name, last_name: row.player.last_name },
    category: row.category,
    unit,
    target,
    targetOptions,
    hasPerfConsent: (consentRes.data ?? []).length > 0,
    attendance: { pct: attendancePct(att), ...countByStatus(att) },
    objectives: objectives.length ? progress(objectives, checks, today) : null,
    injuries: { count: injuries.length, daysOut, active: injuries.some((i) => i.status !== "closed") },
    metrics: metrics
      .map((m) =>
        sheetMetric(
          m,
          points.filter((p) => p.metric_id === m.id).map((p) => ({ session_date: p.session_date, value: Number(p.value) })),
          bench.get(m.id),
          unit,
        ),
      )
      .filter((m) => m.best !== null),
    review: (reviewRes.data as unknown as Review | null) ?? null,
  };
}

export interface CategorySheetRow {
  playerId: string;
  name: string;
  attendancePct: number | null;
  tests: { above: number; total: number };
  recommendation: Outcome | null;
  decision: Outcome | null;
}

/** Resumen de pase de toda la categoría (para la reunión de fin de año). */
export async function loadCategorySheet(
  supabase: SupabaseClient,
  season: Season,
  category: Category,
  targetId?: string,
): Promise<{ target: Category | null; targetOptions: Category[]; objectives: { done: number; total: number } | null; rows: CategorySheetRow[] }> {
  const [categories, metrics, rosterRes, positionsRes] = await Promise.all([
    activeCategories(supabase),
    trackedMetrics(supabase),
    supabase
      .from("player_season_categories")
      .select("position_id, player:players!inner(id, first_name, last_name, primary_position_id, active)")
      .eq("season_id", season.id)
      .eq("category_id", category.id),
    supabase.from("positions").select("id, unit"),
  ]);
  const targetOptions = categories.filter((c) => c.sort_order > category.sort_order);
  const target = targetOptions.find((c) => c.id === targetId) ?? nextCategory(categories, category.id);
  type R = { position_id: number | null; player: { id: string; first_name: string; last_name: string; primary_position_id: number | null; active: boolean } };
  const roster = ((rosterRes.data ?? []) as unknown as R[]).filter((r) => r.player.active);
  const unitOf = new Map((positionsRes.data ?? []).map((p) => [p.id as number, p.unit as string]));

  const today = clubToday();
  const [bests, attendance, objectivesRes, checks, reviewsRes, bench] = await Promise.all([
    fetchAll<{ player_id: string; metric_id: string; value: number }>(
      () =>
        supabase
          .from("v_player_season_best")
          .select("player_id, metric_id, value")
          .eq("season_id", season.id)
          .eq("category_id", category.id)
          .order("player_id")
          .order("metric_id") as never,
    ),
    fetchAll<AttendanceRow>(
      () =>
        supabase
          .from("attendance")
          .select("id, player_id, category_id, season_id, att_date, kind, status, note")
          .eq("category_id", category.id)
          .eq("season_id", season.id)
          .order("id") as never,
    ),
    supabase.from("objectives").select("id, category_id, scope, area, title, sort_order").eq("category_id", category.id).eq("active", true),
    fetchAll<ObjectiveCheck>(
      () =>
        supabase
          .from("objective_checks")
          .select("id, objective_id, season_id, check_date, player_id, achieved, note")
          .eq("season_id", season.id)
          .order("id") as never,
    ),
    supabase.from("promotion_reviews").select("player_id, recommendation, decision").eq("season_id", season.id).eq("from_category_id", category.id),
    target ? benchmarks(supabase, season.id, target.id, metrics.map((m) => m.id)) : Promise.resolve(new Map<string, BenchRow[]>()),
  ]);

  const reviews = new Map((reviewsRes.data ?? []).map((r) => [r.player_id as string, r]));
  const metricById = new Map(metrics.map((m) => [m.id, m]));
  const objectives = (objectivesRes.data ?? []) as Objective[];

  const rows: CategorySheetRow[] = roster
    .map((r) => {
      const pid = r.player.id;
      const unit = unitOf.get((r.position_id ?? r.player.primary_position_id) as number) ?? null;
      const standings = bests
        .filter((b) => b.player_id === pid && metricById.has(b.metric_id))
        .map((b) => {
          const m = metricById.get(b.metric_id)!;
          const picked = pickBench(bench.get(b.metric_id), unit);
          return picked ? standing(Number(b.value), picked.bench, m.higher_is_better) : null;
        });
      const rev = reviews.get(pid);
      return {
        playerId: pid,
        name: `${r.player.last_name}, ${r.player.first_name}`,
        attendancePct: attendancePct(attendance.filter((a) => a.player_id === pid)),
        tests: aboveMedianCount(standings),
        recommendation: (rev?.recommendation as Outcome) ?? null,
        decision: (rev?.decision as Outcome) ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return { target, targetOptions, objectives: objectives.length ? progress(objectives, checks, today) : null, rows };
}
