// Tipos de las tablas/vistas que usa la app (subset del esquema SQL).
// Cuando haya proyecto Supabase: `supabase gen types typescript` y reemplazar.

export type AppRole = "admin" | "coach" | "medical" | "player" | "guardian";
export type TestDomain =
  | "anthropometry"
  | "strength"
  | "speed"
  | "power"
  | "agility"
  | "endurance"
  | "rugby";
export type SessionType = "testing" | "match" | "training";
export type Sex = "male" | "female";
export type InjuryStatus = "active" | "rehab" | "return_to_play" | "closed";

export interface Profile {
  id: string;
  full_name: string;
  email: string | null;
  role: AppRole;
  active: boolean;
}

export interface Season {
  id: string;
  name: string;
  is_current: boolean;
}

export interface Category {
  id: string;
  code: string;
  name: string;
  level: "infantiles" | "juveniles" | "plantel_superior";
  sort_order: number;
}

export interface Position {
  id: number;
  name: string;
  short_name: string;
  unit: "forwards" | "backs";
  line: string;
}

export interface Player {
  id: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  sex: "male" | "female";
  primary_position_id: number | null;
}

/** Jugador con su categoría/puesto de la temporada (lo que se cachea para la cancha). */
export interface RosterPlayer extends Player {
  category_id: string;
  position_id: number | null;
  jersey_number: number | null;
}

export interface TestType {
  id: string;
  code: string;
  name: string;
  domain: TestDomain;
  protocol: string | null;
  sort_order: number;
}

export interface TestMetric {
  id: string;
  test_type_id: string;
  code: string;
  name: string;
  unit: string;
  higher_is_better: boolean;
  decimals: number;
  min_valid: number | null;
  max_valid: number | null;
  is_primary: boolean;
  best_of: "max" | "min" | "avg" | "last";
  derivation: string | null;
  required_consent: string;
  individual_only?: boolean;
  sort_order: number;
}

export interface TestProtocol {
  id: string;
  test_type_id: string;
  version: number;
  params: Record<string, unknown>;
  notes: string | null;
}

export interface TestExclusion {
  category_id: string;
  test_type_id: string;
  reason: string;
}

export interface MetricRange {
  metric_id: string;
  sex: Sex;
  warn_min: number | null;
  warn_max: number | null;
}

/** Intento de un test de cancha (sólo se agregan; corregir = anular). */
export interface TestAttempt {
  id: string;
  session_id: string;
  player_id: string;
  test_type_id: string;
  protocol_id: string;
  attempt: number;
  method: "manual" | "video" | "app" | "fotocelula" | "historico";
  inputs: Record<string, unknown>;
  conditions: string | null;
  device_id: string | null;
  notes: string | null;
  recorded_at: string;
  recorded_by?: string | null;
}

export interface TestAttemptVoid {
  id: string;
  attempt_id: string;
  reason: string;
  voided_at?: string;
}

export interface EvaluationSession {
  id: string;
  season_id: string;
  category_id: string;
  session_type: SessionType;
  session_date: string;
  title: string | null;
  location: string | null;
  opponent: string | null;
}

export interface ResultRow {
  id: string;
  session_id: string;
  player_id: string;
  metric_id: string;
  attempt: number;
  value: number;
  recorded_at: string;
  deleted_at?: string | null;
}

export interface WellnessLog {
  id: string;
  player_id: string;
  log_date: string;
  sleep_hours: number | null;
  sleep_quality: number | null;
  fatigue: number | null;
  soreness: number | null;
  stress: number | null;
  mood: number | null;
  session_rpe: number | null;
  session_minutes: number | null;
  notes?: string | null;
}

export interface Injury {
  id: string;
  player_id: string;
  occurred_on: string;
  context: "match" | "training" | "other";
  body_region: string;
  injury_type: string;
  status: InjuryStatus;
  expected_return: string | null;
  actual_return: string | null;
  days_lost: number | null;
  summary: string | null;
}

export interface Consent {
  player_id: string;
  consent_type: string;
  granted_at: string;
  revoked_at: string | null;
}

export interface ComparisonPoint {
  session_id: string;
  session_date: string;
  season_id: string;
  category_id: string;
  position_id: number | null;
  value: number;
  value_per_kg: number | null;
  category_mean: number | null;
  category_sd: number | null;
  category_n: number | null;
  z_category: number | null;
  unit_mean: number | null;
  z_unit: number | null;
  line_mean: number | null;
  z_line: number | null;
  position_mean: number | null;
  position_n: number | null;
  z_position: number | null;
}

export interface Maturation {
  session_date: string;
  age: number;
  maturity_offset: number;
  age_at_phv: number;
  maturity_status: "pre_phv" | "circa_phv" | "post_phv";
}

export interface AcwrRow {
  day: string;
  load: number;
  acute_load: number;
  chronic_load: number;
  acwr: number | null;
  chronic_window_complete: boolean;
}

export type ObjectiveArea = "game" | "contact" | "attitude" | "other";

export interface Objective {
  id: string;
  category_id: string;
  scope: "team" | "player";
  area: ObjectiveArea;
  title: string;
  look_for: string | null;
  exercise_name: string | null;
  exercise_description: string | null;
  exercise_url: string | null;
  sort_order: number;
}

export interface ObjectiveCheck {
  id: string;
  objective_id: string;
  season_id: string;
  check_date: string;
  player_id: string | null;
  achieved: boolean;
  /** Estado de la práctica (puede faltar en datos guardados por la versión anterior). */
  status?: "not_yet" | "in_progress" | "achieved";
  note: string | null;
}
