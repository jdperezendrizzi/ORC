// Piezas del celular para los tests de cancha: equipo (id del celular),
// sesión del día y caché de intentos. Todo funciona sin señal.

import type { SupabaseClient } from "@supabase/supabase-js";
import { cacheGet, cachePut } from "../offline/db";
import { enqueue } from "../offline/outbox";
import { deterministicId, randomId } from "../offline/ids";
import { addLocalSession, type FieldData } from "../offline/field-data";
import type { EvaluationSession, TestAttempt, TestAttemptVoid } from "../types";
import type { CmjDayPoint } from "./baseline";

// ---------------------------------------------------------------------
// Equipo: un UUID al azar por instalación. Un celular nuevo o restaurado
// es otro equipo (su latencia táctil es otra). Queda aunque se cierre sesión.
// ---------------------------------------------------------------------
const DEVICE_KEY = "orc-device-id";
const DEVICE_SENT_KEY = "orc-device-sent";

function safeGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function safeSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* modo privado */
  }
}

export function deviceLabel(): string {
  const ua = navigator.userAgent;
  const m = ua.match(/\(([^)]+)\)/)?.[1] ?? "";
  const model = m.split(";").map((x) => x.trim()).find((x) => /SM-|Pixel|iPhone|iPad|Moto|Redmi|Xiaomi|Galaxy|Android \d/.test(x));
  return (model ?? (/(iPhone|iPad)/.exec(ua)?.[1] ?? "Celular")).slice(0, 80);
}

/** Id del equipo; lo registra (una vez) para que suba con la cola. */
export async function ensureDevice(): Promise<string> {
  let id = safeGet(DEVICE_KEY);
  if (!id) {
    id = randomId();
    safeSet(DEVICE_KEY, id);
  }
  if (safeGet(DEVICE_SENT_KEY) !== id) {
    await enqueue("test_devices", { id, label: deviceLabel(), platform: navigator.userAgent.slice(0, 200) });
    safeSet(DEVICE_SENT_KEY, id);
  }
  return id;
}

export const currentDeviceId = () => safeGet(DEVICE_KEY);

// ---------------------------------------------------------------------
// Sesión del día (una por categoría y fecha; la del CMJ semanal aparte)
// ---------------------------------------------------------------------
export type FieldSessionKind = "tests" | "cmj-semanal";
export const FIELD_SESSION_TITLE: Record<FieldSessionKind, string> = { tests: "Tests de cancha", "cmj-semanal": "CMJ semanal" };

export const fieldSessionId = (kind: FieldSessionKind, categoryId: string, date: string) => deterministicId("field-session", kind, categoryId, date);

export async function ensureFieldSession(data: FieldData, kind: FieldSessionKind, categoryId: string, date: string): Promise<EvaluationSession> {
  const id = await fieldSessionId(kind, categoryId, date);
  const existing = data.sessions.find((s) => s.id === id);
  if (existing) return existing;
  const session: EvaluationSession = {
    id,
    season_id: data.season.id,
    category_id: categoryId,
    session_type: "testing",
    session_date: date,
    title: FIELD_SESSION_TITLE[kind],
    location: null,
    opponent: null,
  };
  await enqueue("evaluation_sessions", { ...session });
  await addLocalSession(session);
  return session;
}

// ---------------------------------------------------------------------
// Intentos de una sesión (lo del servidor + lo hecho en el celular)
// ---------------------------------------------------------------------
export interface SessionAttempts {
  attempts: TestAttempt[];
  voids: TestAttemptVoid[];
}
const attemptsKey = (sessionId: string) => `attempts:${sessionId}`;

export async function loadCachedAttempts(sessionId: string): Promise<SessionAttempts> {
  return (await cacheGet<SessionAttempts>(attemptsKey(sessionId)))?.data ?? { attempts: [], voids: [] };
}

export async function refreshAttempts(supabase: SupabaseClient, sessionId: string): Promise<SessionAttempts> {
  const a = await supabase
    .from("test_attempts")
    .select("id, session_id, player_id, test_type_id, protocol_id, attempt, method, inputs, conditions, device_id, notes, recorded_at")
    .eq("session_id", sessionId);
  if (a.error) throw new Error(a.error.message);
  const attempts = (a.data ?? []) as TestAttempt[];
  const v = attempts.length
    ? await supabase.from("test_attempt_voids").select("id, attempt_id, reason, voided_at").in("attempt_id", attempts.map((x) => x.id))
    : { data: [], error: null };
  if (v.error) throw new Error(v.error.message);
  const data: SessionAttempts = { attempts, voids: (v.data ?? []) as TestAttemptVoid[] };
  await cachePut(attemptsKey(sessionId), data);
  return data;
}

async function addLocal(sessionId: string, patch: Partial<SessionAttempts>) {
  const cur = await loadCachedAttempts(sessionId);
  await cachePut(attemptsKey(sessionId), {
    attempts: [...cur.attempts.filter((x) => !patch.attempts?.some((y) => y.id === x.id)), ...(patch.attempts ?? [])],
    voids: [...cur.voids.filter((x) => !patch.voids?.some((y) => y.id === x.id)), ...(patch.voids ?? [])],
  });
}

export async function saveAttempt(a: TestAttempt): Promise<void> {
  await addLocal(a.session_id, { attempts: [a] });
  await enqueue("test_attempts", { ...a });
}

export async function voidAttempt(sessionId: string, attemptId: string, reason: string): Promise<void> {
  const v: TestAttemptVoid = { id: randomId(), attempt_id: attemptId, reason: reason.trim() };
  await addLocal(sessionId, { voids: [{ ...v, voided_at: new Date().toISOString() }] });
  await enqueue("test_attempt_voids", { ...v });
}

/** Número del próximo intento: sigue al más alto conocido (anulados incluidos). */
export const nextAttemptNumber = (attempts: TestAttempt[], playerId: string, testTypeId: string) =>
  attempts.filter((a) => a.player_id === playerId && a.test_type_id === testTypeId).reduce((m, a) => Math.max(m, a.attempt), 0) + 1;

// ---------------------------------------------------------------------
// Historial del CMJ (para la base del CMJ semanal)
// ---------------------------------------------------------------------
const cmjHistoryKey = (categoryId: string) => `cmj-history:${categoryId}`;

export async function loadCachedCmjHistory(categoryId: string): Promise<Record<string, CmjDayPoint[]>> {
  return (await cacheGet<Record<string, CmjDayPoint[]>>(cmjHistoryKey(categoryId)))?.data ?? {};
}

export async function refreshCmjHistory(
  supabase: SupabaseClient,
  categoryId: string,
  playerIds: string[],
  metricId: string,
  since: string,
): Promise<Record<string, CmjDayPoint[]>> {
  if (playerIds.length === 0) return {};
  const { data, error } = await supabase
    .from("results")
    .select("player_id, value, method, session:evaluation_sessions!inner(session_date)")
    .eq("metric_id", metricId)
    .in("player_id", playerIds)
    .is("deleted_at", null)
    .gte("recorded_at", `${since}T00:00:00Z`);
  if (error) throw new Error(error.message);
  const out: Record<string, CmjDayPoint[]> = {};
  for (const r of (data ?? []) as unknown as { player_id: string; value: number; method: string; session: { session_date: string } | null }[]) {
    if (!r.session || r.session.session_date < since) continue;
    (out[r.player_id] ??= []).push({ date: r.session.session_date, value: Number(r.value), method: r.method });
  }
  await cachePut(cmjHistoryKey(categoryId), out);
  return out;
}
