"use server";

import { canEdit } from "@/lib/modules";
import { getViewer } from "@/lib/server-data";

/** Autoriza y registra que se compartió el «Estado del equipo». */
export async function logTeamReport(categoryId: string, format: "pdf" | "text"): Promise<{ ok: true } | { error: string }> {
  const { supabase, profile, modules } = await getViewer();
  if (!profile?.active || !canEdit(modules, "sharing")) return { error: "No tenés permiso para compartir reportes." };
  const { error } = await supabase.rpc("log_team_report", { p_category_id: categoryId, p_format: format });
  if (error) return { error: error.message };
  return { ok: true };
}
