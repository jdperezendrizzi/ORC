// Validación de una lesión antes de guardarla (en el celular, con o sin señal).
// La base vuelve a validar al subirla (consentimiento, fechas, permisos).

export const BODY_REGIONS = [
  "head", "neck", "shoulder", "upper_arm", "elbow", "forearm", "wrist_hand", "chest", "thoracic_spine",
  "lumbar_spine", "abdomen", "hip_groin", "thigh_anterior", "thigh_posterior", "knee", "lower_leg", "ankle", "foot", "other",
] as const;
export const INJURY_TYPES = [
  "concussion", "muscle", "ligament", "tendon", "fracture", "dislocation", "contusion", "laceration", "joint_cartilage", "other",
] as const;

export interface InjuryDraft {
  player_id: string;
  occurred_on: string;
  context: string;
  body_region: string;
  injury_type: string;
  side: string | null;
  mechanism: string;
  is_recurrence: boolean;
  expected_return: string | null;
  summary: string | null;
}

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

/** Devuelve el primer problema encontrado, o null si está todo bien. */
export function validateInjury(d: InjuryDraft, today: string, playersWithConsent: Set<string>): string | null {
  if (!d.player_id) return "Elegí el jugador.";
  if (!playersWithConsent.has(d.player_id)) return "El jugador no tiene el consentimiento de salud firmado.";
  if (!isDate(d.occurred_on) || d.occurred_on > today) return "La fecha de la lesión no es válida (no puede ser futura).";
  if (!(BODY_REGIONS as readonly string[]).includes(d.body_region)) return "Elegí la zona del cuerpo.";
  if (!(INJURY_TYPES as readonly string[]).includes(d.injury_type)) return "Elegí el tipo de lesión.";
  if (!["match", "training", "other"].includes(d.context)) return "Elegí dónde pasó.";
  if (d.expected_return && (!isDate(d.expected_return) || d.expected_return < d.occurred_on)) {
    return "El regreso estimado tiene que ser posterior a la lesión.";
  }
  if (d.summary && d.summary.length > 200) return "La descripción es muy larga (máximo 200 caracteres).";
  return null;
}
