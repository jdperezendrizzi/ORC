"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { PostgrestError } from "@supabase/supabase-js";
import type { ActionResult } from "@/components/action-form";
import { canManageInjuries, getViewer } from "@/lib/server-data";
import { INJURY_STATUS_FLOW } from "@/lib/labels";
import { clubToday } from "@/lib/validation";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const optStr = (f: FormData, k: string) => str(f, k) || null;
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));


function dbError(e: PostgrestError | null): ActionResult {
  const msg = e?.message ?? "";
  if (e?.hint === "consent_required" || /consentimiento/i.test(msg)) {
    return { error: "El jugador no tiene el consentimiento de salud firmado. El admin lo tiene que registrar." };
  }
  if (e?.code === "42501" || /row-level security/i.test(msg)) return { error: "No tenés permiso para esta acción." };
  if (e?.code === "23514") return { error: "Revisá las fechas: el regreso no puede ser anterior a la lesión." };
  return { error: msg || "No se pudo guardar." };
}

/** Seguimiento: estado y fechas (sólo área médica y admin; la RLS también lo exige). */
export async function updateInjury(_: ActionResult, f: FormData): Promise<ActionResult> {
  const { supabase, profile } = await getViewer();
  if (!canManageInjuries(profile)) return { error: "Sólo el área médica o el admin actualizan lesiones." };
  const id = str(f, "id");
  const status = str(f, "status");
  const occurred_on = str(f, "occurred_on");
  let actual_return = optStr(f, "actual_return");
  const expected_return = optStr(f, "expected_return");
  if (!(INJURY_STATUS_FLOW as readonly string[]).includes(status)) return { error: "Estado inválido." };
  if (status === "closed" && !actual_return) actual_return = clubToday(); // el alta fija el regreso
  if (status !== "closed" && actual_return) {
    return { error: "La fecha de regreso real se carga al dar el alta." };
  }
  for (const d of [expected_return, actual_return]) {
    if (d && (!isDate(d) || d < occurred_on)) return { error: "Las fechas de regreso no pueden ser anteriores a la lesión." };
  }
  const { error } = await supabase
    .from("injuries")
    .update({ status, expected_return, actual_return, summary: optStr(f, "summary") })
    .eq("id", id);
  if (error) return dbError(error);
  revalidatePath(`/lesiones/${id}`);
  revalidatePath("/lesiones");
  revalidatePath("/");
  return { ok: status === "closed" ? "Alta registrada." : "Lesión actualizada." };
}

/** Nota clínica (sólo área médica y admin; los profes no las ven). */
export async function addInjuryNote(_: ActionResult, f: FormData): Promise<ActionResult> {
  const { supabase, profile } = await getViewer();
  if (!canManageInjuries(profile)) return { error: "Sólo el área médica o el admin cargan notas clínicas." };
  const injury_id = str(f, "injury_id");
  const note = str(f, "note");
  if (!note) return { error: "Escribí la nota." };
  const { error } = await supabase.from("injury_notes").insert({
    id: randomUUID(),
    injury_id,
    note,
    diagnosis: optStr(f, "diagnosis"),
    treatment: optStr(f, "treatment"),
  });
  if (error) return dbError(error);
  revalidatePath(`/lesiones/${injury_id}`);
  return { ok: "Nota guardada." };
}
