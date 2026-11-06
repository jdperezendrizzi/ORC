"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { ActionResult } from "@/components/action-form";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const STAFF = new Set(["admin", "coach", "medical"]);

/**
 * Da acceso de solo lectura ("Mi jugador") al jugador o a un tutor.
 * Si ya existe una cuenta con ese email la vincula; si no, la invita por
 * email (requiere SUPABASE_SERVICE_ROLE_KEY).
 */
export async function grantPortalAccess(_: ActionResult, f: FormData): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  const kind = str(f, "kind");
  const playerId = str(f, "player_id");
  const guardianId = str(f, "guardian_id");
  const email = str(f, "email").toLowerCase();
  const fullName = str(f, "full_name");
  if (kind !== "player" && kind !== "guardian") return { error: "Datos inválidos." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "El email no es válido." };

  // ¿Ya existe una cuenta con ese email?
  // Supabase guarda los emails en minúscula (igual que el que se busca).
  const { data: existing } = await supabase.from("profiles").select("id, role, active").eq("email", email).maybeSingle();
  let profileId = existing?.id as string | undefined;
  // Una cuenta nueva nace como "profe" inactivo (pendiente): esa sí se puede usar.
  if (existing && existing.active && STAFF.has(existing.role as string)) {
    return { error: "Ese email es de un usuario del cuerpo técnico. Usá otro email para el portal." };
  }
  let invited = false;
  if (!profileId) {
    const admin = supabaseAdmin();
    if (!admin) {
      return {
        error:
          "No existe una cuenta con ese email. Creala en Supabase (Authentication → Users → Add user, con ese email) y volvé a tocar «Dar acceso» para vincularla. (Para invitar desde acá, agregá SUPABASE_SERVICE_ROLE_KEY en Vercel.)",
      };
    }
    const h = await headers();
    const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { data: { full_name: fullName }, redirectTo: `${origin}/cuenta/clave` });
    if (error) {
      if (/rate limit/i.test(error.message)) return { error: "Supabase limita los emails por hora en el plan gratis. Probá más tarde." };
      return { error: error.message };
    }
    profileId = data.user.id;
    invited = true;
  }

  const upd = await supabase
    .from("profiles")
    .update({ role: kind, active: true, ...(fullName ? { full_name: fullName } : {}) })
    .eq("id", profileId);
  if (upd.error) return { error: upd.error.message };
  const link =
    kind === "player"
      ? await supabase.from("players").update({ profile_id: profileId }).eq("id", playerId)
      : await supabase.from("guardians").update({ profile_id: profileId, email }).eq("id", guardianId);
  if (link.error) {
    if (link.error.code === "23505") return { error: "Esa cuenta ya está vinculada a otro jugador o tutor." };
    return { error: link.error.message };
  }
  revalidatePath(`/admin/jugadores/${playerId}`);
  return { ok: invited ? `Invitación enviada a ${email}: va a recibir un link para crear su contraseña.` : `Cuenta ${email} vinculada.` };
}

/** Quita el acceso: desvincula la cuenta y la desactiva. */
export async function revokePortalAccess(_: ActionResult, f: FormData): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  const kind = str(f, "kind");
  const playerId = str(f, "player_id");
  const guardianId = str(f, "guardian_id");
  const profileId = str(f, "profile_id");
  const unlink =
    kind === "player"
      ? await supabase.from("players").update({ profile_id: null }).eq("id", playerId)
      : await supabase.from("guardians").update({ profile_id: null }).eq("id", guardianId);
  if (unlink.error) return { error: unlink.error.message };
  const { data: prof } = await supabase.from("profiles").select("role").eq("id", profileId).maybeSingle();
  if (prof && !STAFF.has(prof.role as string)) await supabase.from("profiles").update({ active: false }).eq("id", profileId);
  revalidatePath(`/admin/jugadores/${playerId}`);
  return { ok: "Acceso quitado." };
}
