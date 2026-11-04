"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/components/action-form";
import { aiWeeklySummary } from "@/lib/ai";
import { templateSummary, weekStart, weeklyFacts } from "@/lib/alerts";
import { loadAlertInput } from "@/lib/alerts-server";
import { sessionTypeLabel } from "@/lib/labels";
import { getViewer, getViewerCategories, isStaff } from "@/lib/server-data";

/** Para no gastar el cupo gratis de la IA con clics repetidos. */
const MIN_REGENERATE_MS = 5 * 60_000;

/** Genera (o actualiza) el resumen de la semana de una categoría. */
export async function generateWeeklySummary(_: ActionResult, f: FormData): Promise<ActionResult> {
  const { supabase, profile, season } = await getViewer();
  if (!isStaff(profile) || !season) return { error: "No tenés permiso para generar el resumen." };
  const categoryId = String(f.get("category_id") ?? "");
  const category = (await getViewerCategories()).find((c) => c.id === categoryId);
  if (!category) return { error: "No tenés acceso a esta categoría." };

  const input = await loadAlertInput(supabase, season, [category]);
  const week = weekStart(input.today);

  const { data: existing } = await supabase
    .from("weekly_summaries")
    .select("generated_at")
    .eq("category_id", categoryId)
    .eq("week_start", week)
    .maybeSingle();
  if (existing && Date.now() - Date.parse(existing.generated_at as string) < MIN_REGENERATE_MS) {
    return { error: "Se generó hace menos de 5 minutos. Probá en un rato." };
  }

  const { data: sessions } = await supabase
    .from("evaluation_sessions")
    .select("session_date, title, session_type")
    .eq("category_id", categoryId)
    .eq("season_id", season.id)
    .is("deleted_at", null)
    .gte("session_date", input.today.slice(0, 4) + "-01-01");

  const { facts, codes } = weeklyFacts(
    { ...input, categoryName: category.name, sessions: sessions ?? [] },
    (t) => sessionTypeLabel[t] ?? t,
  );
  const ai = await aiWeeklySummary(facts);
  const content = ai?.text ?? templateSummary(facts);

  const { error } = await supabase.from("weekly_summaries").upsert(
    {
      category_id: categoryId,
      week_start: week,
      period_from: facts.desde,
      period_to: facts.hasta,
      content,
      player_codes: codes,
      facts,
      generator: ai ? `groq:${ai.model}` : "plantilla",
    },
    { onConflict: "category_id,week_start" },
  );
  if (error) return { error: error.message };
  revalidatePath(`/categorias/${categoryId}`);
  return { ok: ai ? "Resumen generado." : "Resumen generado (sin IA: plantilla automática)." };
}
