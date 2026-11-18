"use server";

import { revalidatePath } from "next/cache";
import type { PostgrestError } from "@supabase/supabase-js";
import type { ActionResult } from "@/components/action-form";
import { canManageInjuries, getViewer } from "@/lib/server-data";
import { BLOOD_TYPES, campaignLabel, ORTHO_FIELDS, parseCampaign } from "@/lib/ortho";
import { toOrthoPayload, type OrthoParsedRow } from "@/lib/import/ortho";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const UUID = /^[0-9a-f-]{36}$/i;

function dbError(e: PostgrestError | null): ActionResult {
  const msg = e?.message ?? "";
  if (/consentimiento/i.test(msg)) return { error: "El jugador no tiene el consentimiento de salud firmado. El admin lo tiene que registrar." };
  if (e?.code === "42501" || /row-level security/i.test(msg)) return { error: "No tenés permiso para esta acción." };
  if (e?.code === "23514") return { error: "Hay un valor fuera de rango (revisá peso, altura y sit and reach)." };
  return { error: msg || "No se pudo guardar." };
}

/** Guarda (crea o reemplaza) la ficha de una campaña. Sólo admin y área médica. */
export async function saveOrthoEvaluation(_: ActionResult, f: FormData): Promise<ActionResult> {
  const { supabase, profile } = await getViewer();
  if (!canManageInjuries(profile)) return { error: "Sólo el área médica o el admin cargan la evaluación ortopédica." };
  const player_id = str(f, "player_id");
  const campaign = parseCampaign(str(f, "campaign"));
  if (!UUID.test(player_id) || !campaign) return { error: "Faltan el jugador o la campaña." };

  const row: Record<string, unknown> = { player_id, campaign };
  for (const field of ORTHO_FIELDS) {
    const v = str(f, field.key);
    switch (field.kind) {
      case "number": {
        if (!v) {
          row[field.key] = null;
          break;
        }
        const n = Number(v.replace(",", "."));
        if (!Number.isFinite(n)) return { error: `${field.label}: tiene que ser un número.` };
        if ((field.min !== undefined && n < field.min) || (field.max !== undefined && n > field.max))
          return { error: `${field.label}: ${n} está fuera de rango (${field.min} a ${field.max} ${field.unit ?? ""}).` };
        row[field.key] = n;
        break;
      }
      case "bool":
        row[field.key] = v === "yes" ? true : v === "no" ? false : null;
        break;
      case "date":
        if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return { error: "Fecha inválida." };
        row[field.key] = v || null;
        break;
      default:
        row[field.key] = v || null;
    }
  }
  const { error } = await supabase.from("ortho_evaluations").upsert(row, { onConflict: "player_id,campaign" });
  if (error) return dbError(error);
  revalidatePath(`/ortopedia/${player_id}`);
  revalidatePath("/ortopedia");
  revalidatePath(`/jugadores/${player_id}`);
  return { ok: `Evaluación ${campaignLabel(campaign)} guardada.` };
}

/** Datos fijos de salud: grupo sanguíneo y obra social (ficha privada). */
export async function savePlayerHealth(_: ActionResult, f: FormData): Promise<ActionResult> {
  const { supabase, profile } = await getViewer();
  if (!canManageInjuries(profile)) return { error: "Sólo el área médica o el admin." };
  const player_id = str(f, "player_id");
  const blood = str(f, "blood_type");
  if (!UUID.test(player_id)) return { error: "Jugador inválido." };
  if (blood && !(BLOOD_TYPES as readonly string[]).includes(blood)) return { error: "Grupo sanguíneo inválido." };
  const { error } = await supabase.from("player_private").upsert(
    {
      player_id,
      blood_type: blood || null,
      health_insurance: str(f, "health_insurance").slice(0, 120) || null,
      health_insurance_number: str(f, "health_insurance_number").slice(0, 60) || null,
    },
    { onConflict: "player_id" },
  );
  if (error) return dbError(error);
  revalidatePath(`/ortopedia/${player_id}`);
  return { ok: "Datos guardados." };
}

/** Borra la evaluación de una campaña (sólo admin; queda en la auditoría). */
export async function deleteOrthoEvaluation(_: ActionResult, f: FormData): Promise<ActionResult> {
  const { supabase, profile } = await getViewer();
  if (profile?.role !== "admin" || !profile.active) return { error: "Sólo el admin puede borrar una evaluación." };
  const id = str(f, "id");
  const player_id = str(f, "player_id");
  const { error } = await supabase.from("ortho_evaluations").delete().eq("id", id);
  if (error) return dbError(error);
  revalidatePath(`/ortopedia/${player_id}`);
  revalidatePath("/ortopedia");
  return { ok: "Evaluación borrada." };
}

export interface OrthoImportOutcome {
  ok?: { created: number; updated: number };
  error?: string;
}

/** Importa las filas válidas de la planilla (una transacción: todo o nada). */
export async function importOrtho(rows: OrthoParsedRow[]): Promise<OrthoImportOutcome> {
  const { supabase, profile } = await getViewer();
  if (!canManageInjuries(profile)) return { error: "Sólo el área médica o el admin pueden importar." };
  const payload = toOrthoPayload(rows);
  if (!payload.length) return { error: "No hay filas válidas para importar." };
  const { data, error } = await supabase.rpc("import_ortho_evaluations", { p_rows: payload });
  if (error) return { error: dbError(error).error };
  revalidatePath("/ortopedia");
  return { ok: data as { created: number; updated: number } };
}
