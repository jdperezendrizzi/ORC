"use server";

import { canEdit, canView } from "@/lib/modules";
import { getViewer } from "@/lib/server-data";

/** Registra (y autoriza) una exportación del resumen de asistencia. */
export async function logAttendanceExport(
  categoryId: string,
  from: string,
  to: string,
  format: "xlsx" | "pdf" | "text",
): Promise<{ ok: true } | { error: string }> {
  const { supabase, profile, modules } = await getViewer();
  if (!profile?.active || !canView(modules, "attendance") || !canEdit(modules, "sharing")) {
    return { error: "No tenés permiso para exportar o compartir la asistencia." };
  }
  const { error } = await supabase.rpc("log_attendance_export", { p_category_id: categoryId, p_from: from, p_to: to, p_format: format });
  if (error) return { error: error.message };
  return { ok: true };
}
