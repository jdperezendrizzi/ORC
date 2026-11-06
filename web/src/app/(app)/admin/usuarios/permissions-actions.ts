"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/components/action-form";
import { requireAdmin } from "@/lib/admin";
import { MODULES, roleDefault, roleMax, type ModuleLevel } from "@/lib/modules";
import type { AppRole } from "@/lib/types";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const LEVELS = new Set(["none", "view", "edit"]);

async function replace(profileId: string, rows: { module: string; level: ModuleLevel }[]): Promise<ActionResult | null> {
  const { supabase } = await requireAdmin();
  const del = await supabase.from("user_module_permissions").delete().eq("profile_id", profileId);
  if (del.error) return { error: del.error.message };
  if (rows.length) {
    const ins = await supabase.from("user_module_permissions").insert(rows.map((r) => ({ ...r, profile_id: profileId })));
    if (ins.error) return { error: ins.error.message };
  }
  revalidatePath("/admin/usuarios", "layout");
  return null;
}

async function roleOf(profileId: string): Promise<AppRole | null> {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from("profiles").select("role").eq("id", profileId).maybeSingle();
  return (data?.role as AppRole) ?? null;
}

/** Guarda sólo lo que difiere del valor por defecto del rol (restricciones o habilitaciones). */
export async function saveModulePermissions(_: ActionResult, f: FormData): Promise<ActionResult> {
  const profileId = str(f, "profile_id");
  const role = await roleOf(profileId);
  if (!role) return { error: "Usuario no encontrado." };
  if (role === "admin") return { error: "El admin tiene todos los módulos." };
  const rows: { module: string; level: ModuleLevel }[] = [];
  for (const m of MODULES) {
    const level = str(f, `m_${m.id}`) as ModuleLevel;
    if (!LEVELS.has(level)) return { error: `Elegí un nivel para ${m.label}.` };
    const max = roleMax(role, m.id);
    const order = { none: 0, view: 1, edit: 2 };
    if (order[level] > order[max]) return { error: `${m.label}: su rol permite como máximo «${max === "view" ? "Ve" : max === "none" ? "No ve" : "Carga"}».` };
    if (level !== roleDefault(role, m.id)) rows.push({ module: m.id, level });
  }
  const err = await replace(profileId, rows);
  return err ?? { ok: rows.length ? `Permisos guardados (${rows.length} ajustados respecto del rol).` : "Permisos guardados (los del rol)." };
}

export async function resetModulePermissions(_: ActionResult, f: FormData): Promise<ActionResult> {
  const err = await replace(str(f, "profile_id"), []);
  return err ?? { ok: "Volvió a los permisos de su rol." };
}

/** Copia los ajustes de otro usuario (respetando el máximo del rol de destino). */
export async function copyModulePermissions(_: ActionResult, f: FormData): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  const to = str(f, "profile_id");
  const from = str(f, "from_profile");
  if (!from || from === to) return { error: "Elegí de quién copiar." };
  const role = await roleOf(to);
  if (!role || role === "admin") return { error: "El admin tiene todos los módulos." };
  const { data, error } = await supabase.from("user_module_permissions").select("module, level").eq("profile_id", from);
  if (error) return { error: error.message };
  const order = { none: 0, view: 1, edit: 2 };
  const rows = (data ?? [])
    .map((r) => {
      const id = r.module as (typeof MODULES)[number]["id"];
      const max = roleMax(role, id);
      const level = (order[r.level as ModuleLevel] < order[max] ? r.level : max) as ModuleLevel;
      return { module: r.module as string, level, def: roleDefault(role, id) };
    })
    .filter((r) => r.level !== r.def)
    .map(({ module, level }) => ({ module, level }));
  const err = await replace(to, rows);
  return err ?? { ok: `Permisos copiados (${rows.length} ajustados).` };
}
