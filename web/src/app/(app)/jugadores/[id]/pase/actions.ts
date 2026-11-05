"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/components/action-form";
import { getViewer, getViewerCategories } from "@/lib/server-data";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const OUTCOMES = new Set(["promote", "stay", "observe"]);

async function save(f: FormData, kind: "recommendation" | "decision"): Promise<ActionResult> {
  const { supabase, profile, season } = await getViewer();
  if (!season || !profile?.active) return { error: "No hay temporada actual." };
  const playerId = str(f, "player_id");
  const fromId = str(f, "from_category_id");
  const outcome = str(f, "outcome");
  const note = str(f, "note") || null;
  if (!OUTCOMES.has(outcome)) return { error: "Elegí una opción: sube, se queda o en observación." };
  if (note && note.length > 1000) return { error: "El comentario es muy largo (máximo 1000 caracteres)." };

  if (kind === "decision" && profile.role !== "admin") return { error: "La decisión final la carga el coordinador (admin)." };
  if (kind === "recommendation") {
    const mine = (await getViewerCategories()).some((c) => c.id === fromId);
    if (!(profile.role === "admin" || (profile.role === "coach" && mine))) {
      return { error: "La recomendación la carga el profe de la categoría." };
    }
  }
  const base = {
    player_id: playerId,
    season_id: season.id,
    from_category_id: fromId,
    target_category_id: str(f, "target_category_id") || null,
  };
  const fields = kind === "recommendation" ? { recommendation: outcome, recommendation_note: note } : { decision: outcome, decision_note: note };
  const { error } = await supabase.from("promotion_reviews").upsert({ ...base, ...fields }, { onConflict: "player_id,season_id" });
  if (error) return { error: /row-level security/i.test(error.message) ? "No tenés permiso para esta acción." : error.message };
  revalidatePath(`/jugadores/${playerId}/pase`);
  revalidatePath(`/categorias/${fromId}/pase`);
  return { ok: kind === "recommendation" ? "Recomendación guardada." : "Decisión guardada." };
}

export async function saveRecommendation(prev: ActionResult, f: FormData) {
  return save(f, "recommendation");
}
export async function saveDecision(prev: ActionResult, f: FormData) {
  return save(f, "decision");
}
