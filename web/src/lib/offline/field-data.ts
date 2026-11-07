// Datos que se necesitan en la cancha, descargados mientras hay señal y
// guardados en IndexedDB para trabajar offline.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  WellnessLog,
  Category,
  Objective,
  ObjectiveCheck,
  Consent,
  EvaluationSession,
  Position,
  Profile,
  ResultRow,
  RosterPlayer,
  Season,
  TestMetric,
  TestType,
  TestProtocol,
  TestExclusion,
  MetricRange,
} from "../types";
import { cacheGet, cachePut } from "./db";
import { fetchAll } from "../fetch-all";
import type { AttendanceRow } from "../attendance";
import { effectiveModules, type AppModule, type ModuleLevel, type Modules } from "../modules";

export interface FieldData {
  profile: Profile;
  season: Season;
  categories: Category[];
  positions: Position[];
  testTypes: TestType[];
  metrics: TestMetric[];
  roster: RosterPlayer[];
  sessions: EvaluationSession[];
  consents: Consent[];
  /** Niveles por módulo (puede faltar en datos guardados por versiones anteriores). */
  modules?: Modules;
  /** Tests de cancha (pueden faltar en datos guardados por versiones anteriores). */
  protocols?: TestProtocol[];
  exclusions?: TestExclusion[];
  ranges?: MetricRange[];
  cmjWeeklyCodes?: string[];
}

/** Niveles por módulo del usuario de la cancha (con respaldo por rol). */
export function fieldModules(data: FieldData): Modules {
  return data.modules ?? effectiveModules(data.profile.role, data.profile.active);
}

const FIELD_KEY = "field";
const sessionResultsKey = (sessionId: string) => `results:${sessionId}`;

export async function loadCachedFieldData(): Promise<{ data: FieldData; updatedAt: number } | null> {
  const entry = await cacheGet<FieldData>(FIELD_KEY);
  return entry ? { data: entry.data, updatedAt: entry.updatedAt } : null;
}

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}

/** Descarga todo lo necesario para cargar datos y lo guarda en el celular. */
export async function refreshFieldData(supabase: SupabaseClient): Promise<FieldData> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sesión vencida: volvé a ingresar.");

  const profile = must(
    await supabase.from("profiles").select("id, full_name, email, role, active").eq("id", user.id).single(),
    "perfil",
  ) as Profile;

  const { data: overrides } = await supabase.from("user_module_permissions").select("module, level").eq("profile_id", user.id);
  const modules = effectiveModules(
    profile.role,
    profile.active,
    Object.fromEntries((overrides ?? []).map((o) => [o.module as AppModule, o.level as ModuleLevel])),
  );

  const season = must(
    await supabase.from("seasons").select("id, name, is_current").eq("is_current", true).maybeSingle(),
    "temporada",
  ) as Season | null;
  if (!season) throw new Error("No hay una temporada marcada como actual. Avisale al admin.");

  let categories: Category[];
  if (profile.role === "coach") {
    const rows = must(
      await supabase
        .from("coach_assignments")
        .select("category:categories(id, code, name, level, sort_order)")
        .eq("profile_id", profile.id)
        .eq("season_id", season.id),
      "categorías",
    ) as unknown as { category: Category }[];
    categories = rows.map((r) => r.category);
  } else {
    categories = must(
      await supabase.from("categories").select("id, code, name, level, sort_order").eq("active", true),
      "categorías",
    ) as Category[];
  }
  categories.sort((a, b) => a.sort_order - b.sort_order);
  const categoryIds = categories.map((c) => c.id);

  const [positions, testTypes, metrics, rosterRows, sessions, consents, protocols, exclusions, ranges, weekly] = await Promise.all([
    supabase.from("positions").select("id, name, short_name, unit, line").order("id"),
    supabase.from("test_types").select("id, code, name, domain, protocol, sort_order").eq("active", true).order("sort_order"),
    supabase
      .from("test_metrics")
      .select(
        "id, test_type_id, code, name, unit, higher_is_better, decimals, min_valid, max_valid, is_primary, best_of, derivation, required_consent, sort_order, individual_only",
      )
      .eq("active", true)
      .order("sort_order"),
    supabase
      .from("player_season_categories")
      .select(
        "category_id, position_id, jersey_number, player:players!inner(id, first_name, last_name, birth_date, sex, primary_position_id, active, deleted_at)",
      )
      .eq("season_id", season.id)
      .in("category_id", categoryIds),
    supabase
      .from("evaluation_sessions")
      .select("id, season_id, category_id, session_type, session_date, title, location, opponent")
      .in("category_id", categoryIds)
      .eq("season_id", season.id)
      .is("deleted_at", null)
      .order("session_date", { ascending: false }),
    supabase.from("consents").select("player_id, consent_type, granted_at, revoked_at").is("revoked_at", null),
    supabase.from("test_protocols").select("id, test_type_id, version, params, notes").eq("active", true),
    supabase.from("category_test_exclusions").select("category_id, test_type_id, reason"),
    supabase.from("test_metric_ranges").select("metric_id, sex, warn_min, warn_max"),
    supabase.from("club_settings").select("value").eq("key", "cmj_weekly").maybeSingle(),
  ]);

  type RosterRow = {
    category_id: string;
    position_id: number | null;
    jersey_number: number | null;
    player: RosterPlayer & { active: boolean; deleted_at: string | null };
  };

  const roster = (must(rosterRows, "plantel") as unknown as RosterRow[])
    .filter((r) => r.player.active && !r.player.deleted_at)
    .map(({ player, category_id, position_id, jersey_number }) => ({
      id: player.id,
      first_name: player.first_name,
      last_name: player.last_name,
      birth_date: player.birth_date,
      sex: player.sex,
      primary_position_id: player.primary_position_id,
      category_id,
      position_id: position_id ?? player.primary_position_id,
      jersey_number,
    }))
    .sort((a, b) => (a.position_id ?? 99) - (b.position_id ?? 99) || a.last_name.localeCompare(b.last_name));

  const data: FieldData = {
    profile,
    season,
    categories,
    positions: must(positions, "puestos") as Position[],
    testTypes: must(testTypes, "tests") as TestType[],
    metrics: (must(metrics, "métricas") as TestMetric[]).map(normalizeMetric),
    roster,
    sessions: must(sessions, "sesiones") as EvaluationSession[],
    consents: must(consents, "consentimientos") as Consent[],
    modules,
    protocols: (protocols.data ?? []) as TestProtocol[],
    exclusions: (exclusions.data ?? []) as TestExclusion[],
    ranges: ((ranges.data ?? []) as MetricRange[]).map((r) => ({ ...r, warn_min: num(r.warn_min), warn_max: num(r.warn_max) })),
    cmjWeeklyCodes: ((weekly.data?.value as { category_codes?: string[] } | null)?.category_codes ?? ["M17", "M19"]) as string[],
  };
  await cachePut(FIELD_KEY, data);
  return data;
}

/** Resultados ya cargados de una sesión (para ver/corregir lo que subió otro profe). */
export async function refreshSessionResults(supabase: SupabaseClient, sessionId: string): Promise<ResultRow[]> {
  const rows = must(
    await supabase
      .from("results")
      .select("id, session_id, player_id, metric_id, attempt, value, recorded_at")
      .eq("session_id", sessionId)
      .is("deleted_at", null),
    "resultados",
  ) as ResultRow[];
  await cachePut(sessionResultsKey(sessionId), rows);
  return rows;
}

/** Guarda en el celular el estado conocido de la sesión (incluye lo recién subido). */
export async function saveCachedSessionResults(sessionId: string, rows: ResultRow[]): Promise<void> {
  await cachePut(sessionResultsKey(sessionId), rows);
}

export async function loadCachedSessionResults(sessionId: string): Promise<ResultRow[]> {
  return (await cacheGet<ResultRow[]>(sessionResultsKey(sessionId)))?.data ?? [];
}

/** Agrega al cache una sesión creada offline (para que aparezca en la lista). */
export async function addLocalSession(session: EvaluationSession): Promise<void> {
  const cached = await cacheGet<FieldData>(FIELD_KEY);
  if (!cached) return;
  const sessions = [session, ...cached.data.sessions.filter((s) => s.id !== session.id)];
  await cachePut(FIELD_KEY, { ...cached.data, sessions });
}

export function hasConsent(consents: Consent[], playerId: string, type: string): boolean {
  return consents.some((c) => c.player_id === playerId && c.consent_type === type && !c.revoked_at);
}


const wellnessKey = (categoryId: string, date: string) => `wellness:${categoryId}:${date}`;

/** Bienestar ya cargado de una categoría en una fecha. */
export async function refreshWellness(
  supabase: SupabaseClient,
  playerIds: string[],
  categoryId: string,
  date: string,
): Promise<WellnessLog[]> {
  if (playerIds.length === 0) return [];
  const rows = must(
    await supabase
      .from("wellness_logs")
      .select("id, player_id, log_date, sleep_hours, sleep_quality, fatigue, soreness, stress, mood, session_rpe, session_minutes, notes")
      .eq("log_date", date)
      .in("player_id", playerIds)
      .is("deleted_at", null),
    "bienestar",
  ) as WellnessLog[];
  await cachePut(wellnessKey(categoryId, date), rows);
  return rows;
}

export async function saveCachedWellness(categoryId: string, date: string, rows: WellnessLog[]): Promise<void> {
  await cachePut(wellnessKey(categoryId, date), rows);
}

export async function loadCachedWellness(categoryId: string, date: string): Promise<WellnessLog[]> {
  return (await cacheGet<WellnessLog[]>(wellnessKey(categoryId, date)))?.data ?? [];
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/** Asegura tipos numéricos (numeric de Postgres puede llegar como string según el cliente). */
function normalizeMetric(m: TestMetric): TestMetric {
  return { ...m, min_valid: num(m.min_valid), max_valid: num(m.max_valid), decimals: Number(m.decimals) };
}

// ---------------------------------------------------------------------
// Objetivos (checklist): catálogo de las categorías del usuario y marcas
// de la temporada, guardados en el celular para tachar sin señal.
// ---------------------------------------------------------------------
export interface ObjectivesData {
  objectives: Objective[];
  checks: ObjectiveCheck[];
}
const OBJECTIVES_KEY = "objectives";

export async function loadCachedObjectives(): Promise<ObjectivesData | null> {
  return (await cacheGet<ObjectivesData>(OBJECTIVES_KEY))?.data ?? null;
}

export async function refreshObjectives(supabase: SupabaseClient, seasonId: string, categoryIds: string[]): Promise<ObjectivesData> {
  if (categoryIds.length === 0) return { objectives: [], checks: [] };
  const [objectives, checks] = await Promise.all([
    supabase
      .from("objectives")
      .select("id, category_id, scope, area, title, look_for, exercise_name, exercise_description, exercise_url, sort_order")
      .eq("active", true)
      .in("category_id", categoryIds)
      .order("sort_order"),
    fetchAll<ObjectiveCheck>(
      () =>
        supabase
          .from("objective_checks")
          .select("id, objective_id, season_id, check_date, player_id, achieved, note")
          .eq("season_id", seasonId)
          .order("id") as never,
    ),
  ]);
  const data = { objectives: must(objectives, "objetivos") as Objective[], checks };
  await cachePut(OBJECTIVES_KEY, data);
  return data;
}

/** Guarda en el celular una marca recién hecha (para verla al recargar sin señal). */
export async function saveLocalObjectiveCheck(check: ObjectiveCheck): Promise<void> {
  const cached = await loadCachedObjectives();
  if (!cached) return;
  await cachePut(OBJECTIVES_KEY, { ...cached, checks: [...cached.checks.filter((c) => c.id !== check.id), check] });
}

// ---------------------------------------------------------------------
// Asistencia de una categoría en un día (para tomarla sin señal).
// ---------------------------------------------------------------------
const attendanceKey = (categoryId: string, date: string) => `attendance:${categoryId}:${date}`;

export async function refreshAttendance(supabase: SupabaseClient, categoryId: string, date: string): Promise<AttendanceRow[]> {
  const rows = must(
    await supabase
      .from("attendance")
      .select("id, player_id, category_id, season_id, att_date, kind, status, note")
      .eq("category_id", categoryId)
      .eq("att_date", date),
    "asistencia",
  ) as AttendanceRow[];
  await cachePut(attendanceKey(categoryId, date), rows);
  return rows;
}

export async function loadCachedAttendance(categoryId: string, date: string): Promise<AttendanceRow[]> {
  return (await cacheGet<AttendanceRow[]>(attendanceKey(categoryId, date)))?.data ?? [];
}

export async function saveCachedAttendance(categoryId: string, date: string, rows: AttendanceRow[]): Promise<void> {
  await cachePut(attendanceKey(categoryId, date), rows);
}
