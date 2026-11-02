"use server";

import { getViewer } from "@/lib/server-data";
import { REPORT_DOMAINS } from "@/lib/report/player-report";
import { fetchAll } from "@/lib/fetch-all";

/** Pide a la base autorización para compartir el informe (y lo registra). */
export async function authorizeReport(playerId: string): Promise<{ ok: true } | { error: string }> {
  const { supabase, profile } = await getViewer();
  if (!profile?.active) return { error: "Tu usuario no está activo." };
  const { error } = await supabase.rpc("authorize_player_report", { p_player_id: playerId });
  if (error) {
    if (error.hint === "consent_required" || /consentimiento/i.test(error.message)) {
      return { error: "Falta el consentimiento «Acceso de la familia» firmado por el tutor. Pedile al admin que lo registre." };
    }
    return { error: error.message || "No se pudo autorizar el informe." };
  }
  return { ok: true };
}

export interface ExportRow {
  [column: string]: string | number | null;
}

/**
 * Datos de una categoría para Excel (uso interno del staff).
 * Mismo criterio que el informe: sólo rendimiento (mejor marca de la temporada).
 * La RLS limita a lo que el usuario puede ver; además se registra la exportación.
 */
export async function exportCategory(
  categoryId: string,
): Promise<{ ok: { fileName: string; headers: string[]; rows: (string | number | null)[][] } } | { error: string }> {
  const { supabase, season, profile } = await getViewer();
  if (!profile?.active || !season) return { error: "No disponible." };

  const [{ data: cat }, rosterRes, metricsRes, positionsRes] = await Promise.all([
    supabase.from("categories").select("name, code").eq("id", categoryId).maybeSingle(),
    supabase
      .from("player_season_categories")
      .select("jersey_number, position_id, player:players!inner(id, first_name, last_name, birth_date, active)")
      .eq("season_id", season.id)
      .eq("category_id", categoryId),
    supabase
      .from("test_metrics")
      .select("id, code, name, unit, sort_order, derivation, input_role, test_type:test_types(domain, sort_order)")
      .eq("active", true),
    supabase.from("positions").select("id, short_name"),
  ]);
  if (!cat) return { error: "No tenés acceso a esta categoría." };

  type R = { jersey_number: number | null; position_id: number | null; player: { id: string; first_name: string; last_name: string; birth_date: string; active: boolean } };
  const roster = ((rosterRes.data ?? []) as unknown as R[]).filter((r) => r.player.active);
  type M = { id: string; code: string; name: string; unit: string; sort_order: number; derivation: string | null; input_role: string | null; test_type: { domain: string; sort_order: number } };
  const metrics = ((metricsRes.data ?? []) as unknown as M[])
    .filter((m) => (REPORT_DOMAINS as readonly string[]).includes(m.test_type.domain))
    .filter((m) => !["load", "reps"].includes(m.input_role ?? ""))
    .sort((a, b) => a.test_type.sort_order - b.test_type.sort_order || a.sort_order - b.sort_order);
  const pos = new Map((positionsRes.data ?? []).map((p) => [p.id as number, p.short_name as string]));

  const ids = roster.map((r) => r.player.id);
  // Paginado: con planteles grandes supera las 1000 filas que devuelve Supabase por consulta.
  const bests = ids.length
    ? await fetchAll<{ player_id: string; metric_id: string; value: number }>(
        () =>
          supabase
            .from("v_player_season_best")
            .select("player_id, metric_id, value")
            .eq("season_id", season.id)
            .in("player_id", ids)
            .order("player_id")
            .order("metric_id") as never,
      )
    : [];
  const best = new Map(bests.map((b) => [`${b.player_id}:${b.metric_id}`, Number(b.value)]));
  const used = metrics.filter((m) => ids.some((id) => best.has(`${id}:${m.id}`)));

  const headers = ["Apellido", "Nombre", "Camiseta", "Puesto", "Nacimiento", ...used.map((m) => `${m.name} (${m.unit})`)];
  const rows = roster
    .sort((a, b) => (a.position_id ?? 99) - (b.position_id ?? 99) || a.player.last_name.localeCompare(b.player.last_name))
    .map((r) => [
      r.player.last_name,
      r.player.first_name,
      r.jersey_number,
      r.position_id ? (pos.get(r.position_id) ?? null) : null,
      r.player.birth_date,
      ...used.map((m) => best.get(`${r.player.id}:${m.id}`) ?? null),
    ]);

  const { error } = await supabase.rpc("log_category_export", { p_category_id: categoryId, p_rows: rows.length });
  if (error) return { error: error.message };

  return { ok: { fileName: `ORC-${cat.code}-${season.name}.xlsx`, headers, rows } };
}
