"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/components/action-form";
import { requireAdmin } from "@/lib/admin";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const optStr = (f: FormData, k: string) => str(f, k) || null;
const AREAS = new Set(["game", "contact", "attitude", "other"]);

function fields(f: FormData): { error: string } | { row: Record<string, unknown> } {
  const title = str(f, "title");
  const area = str(f, "area");
  const url = optStr(f, "exercise_url");
  const order = Number(str(f, "sort_order") || "0");
  if (title.length < 3) return { error: "Escribí el objetivo (al menos 3 letras)." };
  if (title.length > 160) return { error: "El objetivo es muy largo (máximo 160 caracteres)." };
  if (!AREAS.has(area)) return { error: "Elegí el área." };
  if (url && !/^https?:\/\/\S+$/.test(url)) return { error: "El link del ejercicio tiene que empezar con http:// o https://" };
  if (!Number.isInteger(order) || order < 0 || order > 999) return { error: "El orden tiene que ser un número entre 0 y 999." };
  return {
    row: {
      area,
      title,
      look_for: optStr(f, "look_for"),
      exercise_name: optStr(f, "exercise_name"),
      exercise_description: optStr(f, "exercise_description"),
      exercise_url: url,
      sort_order: order,
    },
  };
}

function done(categoryId: string, ok: string): ActionResult {
  revalidatePath("/admin/objetivos");
  revalidatePath(`/categorias/${categoryId}`);
  return { ok };
}

export async function createObjective(_: ActionResult, f: FormData): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  const categoryId = str(f, "category_id");
  const parsed = fields(f);
  if ("error" in parsed) return parsed;
  const { error } = await supabase.from("objectives").insert({ ...parsed.row, category_id: categoryId, scope: "team" });
  if (error) return { error: error.message };
  return done(categoryId, "Objetivo agregado.");
}

export async function updateObjective(_: ActionResult, f: FormData): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  const parsed = fields(f);
  if ("error" in parsed) return parsed;
  const { error } = await supabase.from("objectives").update(parsed.row).eq("id", str(f, "id"));
  if (error) return { error: error.message };
  return done(str(f, "category_id"), "Objetivo actualizado.");
}

export async function setObjectiveActive(_: ActionResult, f: FormData): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  const active = str(f, "active") === "true";
  const { error } = await supabase.from("objectives").update({ active }).eq("id", str(f, "id"));
  if (error) return { error: error.message };
  return done(str(f, "category_id"), active ? "Objetivo reactivado." : "Objetivo desactivado.");
}

/** Copia los objetivos vigentes de otra categoría (para no cargarlos de cero). */
export async function copyObjectives(_: ActionResult, f: FormData): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  const from = str(f, "from_category");
  const to = str(f, "category_id");
  if (!from || from === to) return { error: "Elegí otra categoría de origen." };
  const { data, error } = await supabase
    .from("objectives")
    .select("scope, area, title, look_for, exercise_name, exercise_description, exercise_url, sort_order")
    .eq("category_id", from)
    .eq("active", true);
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Esa categoría no tiene objetivos vigentes." };
  const { data: existing } = await supabase.from("objectives").select("title").eq("category_id", to);
  const have = new Set((existing ?? []).map((o) => String(o.title).toLowerCase()));
  const rows = data.filter((o) => !have.has(String(o.title).toLowerCase())).map((o) => ({ ...o, category_id: to }));
  if (rows.length === 0) return { error: "Ya están todos copiados." };
  const ins = await supabase.from("objectives").insert(rows);
  if (ins.error) return { error: ins.error.message };
  return done(to, `Se copiaron ${rows.length} objetivos. Revisalos y ajustalos a esta categoría.`);
}
