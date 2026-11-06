"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/components/action-form";
import { canEdit } from "@/lib/modules";
import { getViewer } from "@/lib/server-data";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Aplica los pases (todo o nada; la base vuelve a verificar permisos y categorías). */
export async function applyRollover(_: ActionResult, f: FormData): Promise<ActionResult> {
  const { supabase, season, modules } = await getViewer();
  if (!season || !canEdit(modules, "season_rollover")) return { error: "No tenés permiso para aplicar pases de temporada." };
  const toSeason = String(f.get("to_season") ?? "");
  const toName = String(f.get("to_season_name") ?? "la temporada nueva");
  let moves: { player_id: string; category_id: string }[];
  try {
    moves = JSON.parse(String(f.get("moves") ?? "[]"));
  } catch {
    return { error: "Datos inválidos." };
  }
  if (!UUID.test(toSeason)) return { error: "Elegí la temporada destino." };
  moves = moves.filter((m) => UUID.test(m.player_id) && UUID.test(m.category_id));
  if (moves.length === 0) return { error: "No hay jugadores seleccionados con categoría destino." };

  const { data, error } = await supabase.rpc("apply_promotions", { p_from_season: season.id, p_to_season: toSeason, p_moves: moves });
  if (error) return { error: error.message };
  // PostgREST devuelve el jsonb directo; se tolera también la forma [{ apply_promotions: {...} }].
  const raw = (Array.isArray(data) ? (data[0]?.apply_promotions ?? data[0]) : data) as { applied?: number; skipped?: number } | null;
  const r = { applied: Number(raw?.applied ?? 0), skipped: Number(raw?.skipped ?? 0) };
  revalidatePath("/pase-de-temporada");
  return {
    ok: `Listo: ${r.applied} ${r.applied === 1 ? "jugador pasó" : "jugadores pasaron"} a ${toName}${r.skipped ? ` (${r.skipped} ya tenían categoría y no se tocaron)` : ""}.`,
  };
}
