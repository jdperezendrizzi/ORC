"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/components/action-form";
import { requireAdmin } from "@/lib/admin";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const done = (ok: string): ActionResult => {
  revalidatePath("/admin/tests");
  return { ok };
};

/** Versión nueva del protocolo (los parámetros de una versión no se editan). */
export async function createProtocolVersion(_: ActionResult, f: FormData): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  const testTypeId = str(f, "test_type_id");
  let params: unknown;
  try {
    params = JSON.parse(str(f, "params"));
  } catch {
    return { error: "Los parámetros no son un JSON válido." };
  }
  if (!params || typeof params !== "object" || Array.isArray(params)) return { error: "Los parámetros tienen que ser un objeto JSON ({ … })." };
  const notes = str(f, "notes") || null;
  const { data: cur } = await supabase.from("test_protocols").select("params").eq("test_type_id", testTypeId).eq("active", true).maybeSingle();
  if (cur && JSON.stringify(cur.params) === JSON.stringify(params)) return { error: "No cambiaste ningún parámetro." };
  const { error } = await supabase.from("test_protocols").insert({ test_type_id: testTypeId, version: 1, params, notes });
  if (error) return { error: error.message };
  return done("Versión nueva creada. Los resultados anteriores quedan con su versión.");
}

export async function addExclusion(_: ActionResult, f: FormData): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  const reason = str(f, "reason");
  if (reason.length < 3) return { error: "Escribí el motivo (al menos 3 letras)." };
  const { error } = await supabase
    .from("category_test_exclusions")
    .upsert({ category_id: str(f, "category_id"), test_type_id: str(f, "test_type_id"), reason }, { onConflict: "category_id,test_type_id" });
  if (error) return { error: error.message };
  return done("Listo: ese test ya no se puede cargar en esa categoría.");
}

export async function removeExclusion(_: ActionResult, f: FormData): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("category_test_exclusions").delete().eq("category_id", str(f, "category_id")).eq("test_type_id", str(f, "test_type_id"));
  if (error) return { error: error.message };
  return done("Listo: el test vuelve a estar habilitado.");
}

export async function setCmjWeekly(_: ActionResult, f: FormData): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  const codes = f.getAll("codes").map(String).filter(Boolean);
  const { error } = await supabase.from("club_settings").upsert({ key: "cmj_weekly", value: { category_codes: codes } }, { onConflict: "key" });
  if (error) return { error: error.message };
  return done(codes.length ? `CMJ semanal en: ${codes.join(", ")}.` : "CMJ semanal deshabilitado.");
}
