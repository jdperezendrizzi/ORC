"use server";

import { canEdit, canView } from "@/lib/modules";
import { getViewer } from "@/lib/server-data";

/** Autoriza y registra que se compartió el resumen de objetivos de una categoría. */
export async function logObjectivesReport(categoryId: string, format: "pdf" | "text"): Promise<{ ok: true } | { error: string }> {
  const { supabase, profile, modules } = await getViewer();
  if (!profile?.active || !canView(modules, "objectives") || !canEdit(modules, "sharing")) {
    return { error: "No tenés permiso para compartir los objetivos." };
  }
  const { error } = await supabase.rpc("log_objectives_report", { p_category_id: categoryId, p_format: format });
  if (!error) return { ok: true };
  // Mientras la migración no esté aplicada en la base, se registra como reporte del equipo.
  if (error.code === "PGRST202" || /log_objectives_report/.test(error.message)) {
    const fb = await supabase.rpc("log_team_report", { p_category_id: categoryId, p_format: format });
    if (!fb.error) return { ok: true };
    return { error: fb.error.message };
  }
  return { error: error.message };
}
