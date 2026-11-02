"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { PostgrestError } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ActionResult } from "@/components/action-form";

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const optStr = (f: FormData, k: string) => str(f, k) || null;
const optInt = (f: FormData, k: string) => (str(f, k) === "" ? null : Number(str(f, k)));

/** Errores de la base en castellano para la pantalla. */
function dbError(e: PostgrestError | null, fallback = "No se pudo guardar."): ActionResult {
  if (!e) return { error: fallback };
  const msg = e.message ?? "";
  if (e.code === "23505") return { error: "Ya existe un registro igual (por ejemplo, un consentimiento vigente del mismo tipo)." };
  if (e.code === "23514") return { error: msg.includes("menor") || msg.includes("tutor") ? msg : `Dato inválido: ${msg}` };
  if (e.code === "42501" || /row-level security/i.test(msg)) return { error: "No tenés permiso para esta acción." };
  if (e.code === "23503") return { error: "El registro está relacionado con otros datos y no se puede borrar." };
  return { error: msg || fallback };
}

function validDate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

// ---------------------------------------------------------------------
// Jugadores
// ---------------------------------------------------------------------
function playerFields(f: FormData) {
  return {
    first_name: str(f, "first_name"),
    last_name: str(f, "last_name"),
    birth_date: str(f, "birth_date"),
    sex: str(f, "sex") as "male" | "female",
    dominant_side: optStr(f, "dominant_side"),
    primary_position_id: optInt(f, "primary_position_id"),
    secondary_position_id: optInt(f, "secondary_position_id"),
  };
}

function checkPlayer(p: ReturnType<typeof playerFields>): string | null {
  if (!p.first_name || !p.last_name) return "Completá nombre y apellido.";
  if (!validDate(p.birth_date)) return "La fecha de nacimiento no es válida.";
  const age = (Date.now() - Date.parse(p.birth_date)) / (365.25 * 864e5);
  if (age < 4 || age > 60) return "Revisá la fecha de nacimiento: la edad no parece correcta.";
  if (p.sex !== "male" && p.sex !== "female") return "Elegí el sexo.";
  return null;
}

async function saveSeasonCategory(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"],
  seasonId: string,
  playerId: string,
  f: FormData,
): Promise<ActionResult | null> {
  const categoryId = optStr(f, "category_id");
  if (!categoryId) {
    const { error } = await supabase.from("player_season_categories").delete().eq("player_id", playerId).eq("season_id", seasonId);
    return error ? dbError(error) : null;
  }
  const { error } = await supabase.from("player_season_categories").upsert(
    {
      player_id: playerId,
      season_id: seasonId,
      category_id: categoryId,
      position_id: optInt(f, "primary_position_id"),
      jersey_number: optInt(f, "jersey_number"),
    },
    { onConflict: "player_id,season_id" },
  );
  return error ? dbError(error) : null;
}

export async function createPlayer(_: ActionResult, f: FormData): Promise<ActionResult> {
  const { supabase, season } = await requireAdmin();
  const p = playerFields(f);
  const invalid = checkPlayer(p);
  if (invalid) return { error: invalid };
  const id = randomUUID();
  const { error } = await supabase.from("players").insert({ id, ...p });
  if (error) return dbError(error);
  if (season) {
    const r = await saveSeasonCategory(supabase, season.id, id, f);
    if (r) return r;
  }
  revalidatePath("/admin");
  redirect(`/admin/jugadores/${id}?nuevo=1`);
}

export async function updatePlayer(_: ActionResult, f: FormData): Promise<ActionResult> {
  const { supabase, season } = await requireAdmin();
  const id = str(f, "id");
  const p = playerFields(f);
  const invalid = checkPlayer(p);
  if (invalid) return { error: invalid };
  const { error } = await supabase.from("players").update(p).eq("id", id);
  if (error) return dbError(error);
  if (season) {
    const r = await saveSeasonCategory(supabase, season.id, id, f);
    if (r) return r;
  }
  revalidatePath(`/admin/jugadores/${id}`);
  revalidatePath("/admin/jugadores");
  return { ok: "Datos guardados." };
}

export async function setPlayerActive(_: ActionResult, f: FormData): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  const id = str(f, "id");
  const active = str(f, "active") === "true";
  const { error } = await supabase.from("players").update({ active }).eq("id", id);
  if (error) return dbError(error);
  revalidatePath(`/admin/jugadores/${id}`);
  revalidatePath("/admin/jugadores");
  return { ok: active ? "Jugador reactivado." : "Jugador dado de baja." };
}

export async function savePrivate(_: ActionResult, f: FormData): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  const player_id = str(f, "player_id");
  const { error } = await supabase.from("player_private").upsert(
    {
      player_id,
      document_id: optStr(f, "document_id"),
      phone: optStr(f, "phone"),
      email: optStr(f, "email"),
      address: optStr(f, "address"),
      emergency_contact: optStr(f, "emergency_contact"),
      medical_notes: optStr(f, "medical_notes"),
    },
    { onConflict: "player_id" },
  );
  if (error) return dbError(error);
  revalidatePath(`/admin/jugadores/${player_id}`);
  return { ok: "Datos privados guardados." };
}

// ---------------------------------------------------------------------
// Tutores
// ---------------------------------------------------------------------
export async function addGuardian(_: ActionResult, f: FormData): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  const player_id = str(f, "player_id");
  const full_name = str(f, "full_name");
  const relationship = str(f, "relationship");
  if (!full_name) return { error: "Completá el nombre del tutor." };
  if (!["madre", "padre", "tutor_legal", "otro"].includes(relationship)) return { error: "Elegí la relación." };
  const id = randomUUID();
  const { error } = await supabase.from("guardians").insert({
    id,
    full_name,
    document_id: optStr(f, "document_id"),
    phone: optStr(f, "phone"),
    email: optStr(f, "email"),
  });
  if (error) return dbError(error);
  const link = await supabase
    .from("player_guardians")
    .insert({ player_id, guardian_id: id, relationship, is_primary: f.get("is_primary") === "on" });
  if (link.error) return dbError(link.error);
  revalidatePath(`/admin/jugadores/${player_id}`);
  return { ok: `${full_name} agregado como tutor.` };
}

export async function unlinkGuardian(_: ActionResult, f: FormData): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  const player_id = str(f, "player_id");
  const { error } = await supabase
    .from("player_guardians")
    .delete()
    .eq("player_id", player_id)
    .eq("guardian_id", str(f, "guardian_id"));
  if (error) return dbError(error);
  revalidatePath(`/admin/jugadores/${player_id}`);
  return { ok: "Tutor desvinculado." };
}

// ---------------------------------------------------------------------
// Consentimientos
// ---------------------------------------------------------------------
export async function registerConsent(_: ActionResult, f: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireAdmin();
  const player_id = str(f, "player_id");
  const consent_type = str(f, "consent_type");
  const signed = str(f, "guardian_id"); // "" = el propio jugador
  const date = str(f, "granted_on");
  const document_version = str(f, "document_version") || "2026-v1";
  if (!consent_type) return { error: "Elegí el tipo de consentimiento." };
  if (!validDate(date)) return { error: "La fecha de firma no es válida." };
  if (Date.parse(date) > Date.now() + 864e5) return { error: "La fecha de firma no puede ser futura." };
  const { error } = await supabase.from("consents").insert({
    player_id,
    consent_type,
    guardian_id: signed || null,
    document_version,
    // Mediodía (hora argentina) del día de firma; si es hoy, la hora actual,
    // así una revocación del mismo día nunca queda "antes" de la firma.
    granted_at: new Date(Math.min(Date.parse(`${date}T12:00:00-03:00`), Date.now())).toISOString(),
    notes: optStr(f, "notes"),
    recorded_by: user.id,
  });
  if (error) return dbError(error);
  revalidatePath(`/admin/jugadores/${player_id}`);
  revalidatePath("/admin/jugadores");
  return { ok: "Consentimiento registrado." };
}

export async function revokeConsent(_: ActionResult, f: FormData): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  const player_id = str(f, "player_id");
  const { error } = await supabase.from("consents").update({ revoked_at: new Date().toISOString() }).eq("id", str(f, "id"));
  if (error) return dbError(error);
  revalidatePath(`/admin/jugadores/${player_id}`);
  revalidatePath("/admin/jugadores");
  return { ok: "Consentimiento revocado." };
}

// ---------------------------------------------------------------------
// Usuarios
// ---------------------------------------------------------------------
async function assignCategories(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"],
  seasonId: string,
  profileId: string,
  categoryIds: string[],
): Promise<ActionResult | null> {
  const { data: current, error } = await supabase
    .from("coach_assignments")
    .select("id, category_id")
    .eq("profile_id", profileId)
    .eq("season_id", seasonId);
  if (error) return dbError(error);
  const keep = new Set(categoryIds);
  const toDelete = (current ?? []).filter((a) => !keep.has(a.category_id as string)).map((a) => a.id as string);
  const existing = new Set((current ?? []).map((a) => a.category_id as string));
  const toInsert = categoryIds.filter((c) => !existing.has(c));
  if (toDelete.length) {
    const d = await supabase.from("coach_assignments").delete().in("id", toDelete);
    if (d.error) return dbError(d.error);
  }
  if (toInsert.length) {
    const i = await supabase
      .from("coach_assignments")
      .insert(toInsert.map((category_id) => ({ id: randomUUID(), profile_id: profileId, category_id, season_id: seasonId })));
    if (i.error) return dbError(i.error);
  }
  return null;
}

export async function updateUser(_: ActionResult, f: FormData): Promise<ActionResult> {
  const { supabase, season, user } = await requireAdmin();
  const id = str(f, "id");
  const role = str(f, "role");
  const active = f.get("active") === "on";
  if (!["admin", "coach", "medical"].includes(role)) return { error: "Elegí un rol." };
  if (id === user.id && (!active || role !== "admin")) {
    return { error: "No podés quitarte a vos mismo el rol de admin ni desactivarte." };
  }
  const { error } = await supabase.from("profiles").update({ role, active, full_name: str(f, "full_name") || undefined }).eq("id", id);
  if (error) return dbError(error);
  if (season) {
    const r = await assignCategories(supabase, season.id, id, role === "coach" ? f.getAll("category_ids").map(String) : []);
    if (r) return r;
  }
  revalidatePath("/admin/usuarios");
  return { ok: "Usuario actualizado." };
}

export async function inviteUser(_: ActionResult, f: FormData): Promise<ActionResult> {
  const { supabase, season } = await requireAdmin();
  const admin = supabaseAdmin();
  if (!admin) return { error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor para invitar por email." };
  const email = str(f, "email").toLowerCase();
  const full_name = str(f, "full_name");
  const role = str(f, "role");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "El email no es válido." };
  if (!full_name) return { error: "Completá el nombre." };
  if (!["admin", "coach", "medical"].includes(role)) return { error: "Elegí un rol." };

  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name },
    redirectTo: `${origin}/cuenta/clave`,
  });
  if (error) {
    if (/already/i.test(error.message)) return { error: "Ya existe un usuario con ese email." };
    if (/rate limit/i.test(error.message)) return { error: "Supabase limita los emails por hora en el plan gratis. Probá más tarde." };
    return { error: error.message };
  }
  const id = data.user.id;
  const upd = await supabase.from("profiles").update({ role, active: true, full_name }).eq("id", id);
  if (upd.error) return dbError(upd.error);
  if (season && role === "coach") {
    const r = await assignCategories(supabase, season.id, id, f.getAll("category_ids").map(String));
    if (r) return r;
  }
  revalidatePath("/admin/usuarios");
  return { ok: `Invitación enviada a ${email}. Va a recibir un link para crear su contraseña.` };
}

// ---------------------------------------------------------------------
// Temporadas
// ---------------------------------------------------------------------
export async function createSeason(_: ActionResult, f: FormData): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  const name = str(f, "name");
  const starts_on = str(f, "starts_on");
  const ends_on = str(f, "ends_on");
  const makeCurrent = f.get("make_current") === "on";
  if (!name) return { error: "Poné un nombre (por ejemplo 2027)." };
  if (!validDate(starts_on) || !validDate(ends_on) || ends_on <= starts_on) return { error: "Revisá las fechas." };
  if (makeCurrent) {
    const off = await supabase.from("seasons").update({ is_current: false }).eq("is_current", true);
    if (off.error) return dbError(off.error);
  }
  const { error } = await supabase.from("seasons").insert({ id: randomUUID(), name, starts_on, ends_on, is_current: makeCurrent });
  if (error) return dbError(error);
  revalidatePath("/admin/temporada");
  revalidatePath("/");
  return { ok: `Temporada ${name} creada${makeCurrent ? " y marcada como actual" : ""}.` };
}

export async function setCurrentSeason(_: ActionResult, f: FormData): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  const off = await supabase.from("seasons").update({ is_current: false }).eq("is_current", true);
  if (off.error) return dbError(off.error);
  const { error } = await supabase.from("seasons").update({ is_current: true }).eq("id", str(f, "id"));
  if (error) return dbError(error);
  revalidatePath("/admin/temporada");
  revalidatePath("/");
  return { ok: "Temporada actual cambiada." };
}

// ---------------------------------------------------------------------
// Importación de plantel (Excel/CSV)
// ---------------------------------------------------------------------
export interface ImportOutcome {
  ok?: { created: number; updated: number; guardians: number; consents: number };
  error?: string;
}

export async function importRoster(rows: unknown[], documentVersion: string): Promise<ImportOutcome> {
  const { supabase, season } = await requireAdmin();
  if (!season) return { error: "No hay temporada actual: creala en Temporada antes de importar." };
  if (!Array.isArray(rows) || rows.length === 0) return { error: "No hay filas válidas para importar." };
  if (rows.length > 1000) return { error: "Máximo 1000 jugadores por importación." };
  const { data, error } = await supabase.rpc("import_roster", {
    p_season_id: season.id,
    p_rows: rows,
    p_document_version: documentVersion.trim() || `${season.name}-v1`,
  });
  if (error) {
    const r = dbError(error, "No se pudo importar.");
    // El mensaje de la base ya indica la fila ("Fila 12: ...").
    return { error: /^Fila \d+:/.test(error.message) ? `${error.message}. No se importó nada: corregí esa fila y probá de nuevo.` : r.error };
  }
  revalidatePath("/admin");
  revalidatePath("/admin/jugadores");
  return { ok: data as ImportOutcome["ok"] };
}
