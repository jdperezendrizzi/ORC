// Evaluación ortopédica y traumatológica anual (ficha del club).
// Una sola definición de campos para el formulario, la importación, la
// plantilla de Excel y la vista de evolución.

export type OrthoRegionStatus = "normal" | "observe" | "altered";
export type OrthoOutcome = "clear" | "indications" | "referred";

export const REGION_STATUS: { value: OrthoRegionStatus; label: string; icon: string; tone: string }[] = [
  { value: "normal", label: "Normal", icon: "🟢", tone: "tone-green" },
  { value: "observe", label: "A controlar", icon: "🟡", tone: "tone-amber" },
  { value: "altered", label: "Alterado", icon: "🔴", tone: "tone-red" },
];
export const OUTCOMES: { value: OrthoOutcome; label: string; icon: string; tone: string; help: string }[] = [
  { value: "clear", label: "Sin hallazgos", icon: "🟢", tone: "tone-green", help: "Puede entrenar sin indicaciones." },
  { value: "indications", label: "Con indicaciones", icon: "🟡", tone: "tone-amber", help: "Tiene indicaciones a seguir (ejercicios, controles, calzado…)." },
  { value: "referred", label: "Derivado", icon: "🔴", tone: "tone-red", help: "Se lo derivó a un especialista o a hacer estudios." },
];
export const regionStatusOf = (v: string | null | undefined) => REGION_STATUS.find((s) => s.value === v) ?? null;
export const outcomeOf = (v: string | null | undefined) => OUTCOMES.find((s) => s.value === v) ?? null;

export const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "0+", "0-"] as const;

export type OrthoFieldKind = "date" | "text" | "long" | "number" | "bool" | "status" | "outcome";
export interface OrthoField {
  key: string;
  label: string;
  kind: OrthoFieldKind;
  /** Encabezado en la planilla (por defecto, label). */
  header?: string;
  aliases?: string[];
  unit?: string;
  min?: number;
  max?: number;
  hint?: string;
}
export interface OrthoSection {
  id: string;
  title: string;
  by: string;
  fields: OrthoField[];
}

export const REGIONS = [
  { key: "spine", label: "Columna" },
  { key: "hips", label: "Caderas" },
  { key: "knees", label: "Rodillas" },
  { key: "feet", label: "Pies" },
] as const;

export const ORTHO_SECTIONS: OrthoSection[] = [
  {
    id: "datos",
    title: "Evaluación",
    by: "",
    fields: [
      { key: "evaluated_on", label: "Fecha de la evaluación", kind: "date", header: "Fecha evaluación", aliases: ["fecha", "fecha de evaluacion"] },
      { key: "examiner", label: "Médico", kind: "text", aliases: ["medico", "evaluador", "profesional"] },
      { key: "weight_kg", label: "Peso", kind: "number", unit: "kg", min: 10, max: 200, header: "Peso (kg)", aliases: ["peso", "peso kg"] },
      { key: "height_cm", label: "Altura", kind: "number", unit: "cm", min: 80, max: 230, header: "Altura (cm)", aliases: ["altura", "talla", "altura cm", "talla cm"] },
    ],
  },
  {
    id: "antecedentes",
    title: "Antecedentes",
    by: "Lo completan los padres",
    fields: [
      { key: "allergies", label: "Alergias", kind: "long" },
      { key: "relevant_conditions", label: "Enfermedades de importancia", kind: "long", aliases: ["enfermedades"] },
      { key: "usual_medication", label: "Medicación habitual", kind: "long", aliases: ["medicacion"] },
      { key: "surgeries_other", label: "Cirugías no traumatológicas", kind: "long" },
      { key: "surgeries_ortho", label: "Cirugías traumatológicas", kind: "long", hint: "Patología, fecha, lado y cómo evolucionó." },
      { key: "muscle_injuries", label: "Lesiones musculares", kind: "long", hint: "Desgarros / distensiones confirmadas: músculo, lado y fecha." },
      { key: "muscle_treatment", label: "Tratamiento de lesiones musculares", kind: "long", hint: "Vacío = no hizo tratamiento. Si hizo: tipo y duración.", aliases: ["tratamiento muscular"] },
      { key: "joint_injuries", label: "Lesiones articulares", kind: "long", hint: "Esguinces / luxaciones: región, lado y fecha." },
      { key: "joint_treatment", label: "Tratamiento de lesiones articulares", kind: "long", hint: "Vacío = no hizo tratamiento. Si hizo: tipo y duración.", aliases: ["tratamiento articular"] },
      { key: "fractures", label: "Fracturas", kind: "long", hint: "Hueso, lado, fecha, tipo y duración del tratamiento." },
      { key: "followed_to_discharge", label: "Seguimiento médico hasta el alta", kind: "bool", aliases: ["seguimiento hasta el alta"] },
      { key: "post_return_control", label: "Control evolutivo luego de volver al deporte", kind: "bool", aliases: ["control evolutivo"] },
      { key: "family_comments", label: "Observaciones de la familia", kind: "long", aliases: ["comentarios familia", "comentarios padres"] },
    ],
  },
  {
    id: "examen",
    title: "Examen físico",
    by: "Lo completa el médico",
    fields: REGIONS.flatMap((r) => [
      { key: `${r.key}_status`, label: r.label, kind: "status" as const, header: `${r.label} estado`, aliases: [r.label.toLowerCase()] },
      { key: `${r.key}_notes`, label: `${r.label}: detalle`, kind: "long" as const, header: `${r.label} detalle` },
    ]),
  },
  {
    id: "movilidad",
    title: "Movilidad y flexibilidad",
    by: "Lo completa el médico",
    fields: [
      { key: "mobility_shoulders", label: "Movilidad de hombros", kind: "text", aliases: ["movilidad hombros"] },
      { key: "mobility_hips", label: "Movilidad de caderas", kind: "text", aliases: ["movilidad caderas"] },
      { key: "mobility_ankles", label: "Movilidad de tobillos", kind: "text", aliases: ["movilidad tobillos"] },
      { key: "sit_reach_cm", label: "Sit and reach", kind: "number", unit: "cm", min: -40, max: 60, header: "Sit and reach (cm)", aliases: ["sit and reach", "sit reach"] },
      { key: "thomas_test", label: "Test de Thomas (PS + RA)", kind: "text", header: "Test de Thomas", aliases: ["thomas"] },
    ],
  },
  {
    id: "cierre",
    title: "Conclusión",
    by: "Lo completa el médico",
    fields: [
      { key: "observations", label: "Observaciones", kind: "long", aliases: ["observaciones medico"] },
      { key: "injury_evolution", label: "Evolución de lesiones", kind: "long" },
      { key: "studies", label: "Estudios", kind: "long" },
      { key: "referrals", label: "Derivaciones", kind: "long" },
      { key: "indications", label: "Indicaciones", kind: "long" },
      { key: "outcome", label: "Resultado", kind: "outcome", hint: "Es lo único que ve el profe." },
    ],
  },
];

export const ORTHO_FIELDS: OrthoField[] = ORTHO_SECTIONS.flatMap((s) => s.fields);
export const ORTHO_COLUMNS = ORTHO_FIELDS.map((f) => f.key);

export type OrthoEvaluation = { id: string; player_id: string; campaign: number; bmi: number | null } & Record<string, unknown>;

/** Campaña = año en que empieza (2026 → «2026-2027»). */
export const campaignLabel = (c: number) => `${c}-${c + 1}`;

/** Campaña por defecto: la del año en curso (las evaluaciones se hacen a fin de año). */
export function currentCampaign(today: string): number {
  const [y, m] = today.split("-").map(Number);
  return m <= 3 ? y - 1 : y;
}

/** «2025», «2025-2026», «2025/26», «25/26» → 2025. */
export function parseCampaign(cell: unknown): number | null {
  const s = String(cell ?? "").trim();
  const m = s.match(/^(\d{2}|\d{4})(?:\s*[-/]\s*(\d{2}|\d{4}))?$/);
  if (!m) return null;
  let y = Number(m[1]);
  if (m[1].length === 2) y += 2000;
  return y >= 2015 && y <= 2100 ? y : null;
}

export function bmiOf(weight: number | null | undefined, height: number | null | undefined): number | null {
  if (!weight || !height) return null;
  return Math.round((weight / (height / 100) ** 2) * 10) / 10;
}

const fold = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9+-]+/g, " ")
    .trim();

export function parseRegionStatus(cell: unknown): OrthoRegionStatus | null | undefined {
  const s = fold(cell);
  if (!s) return null;
  if (/^(normal|n|ok|bien|sin (alteraciones|hallazgos)|verde)/.test(s)) return "normal";
  if (/^(a controlar|controlar|control|observar|observ|leve|amarillo)/.test(s)) return "observe";
  if (/^(alterado|alteracion|alterada|patologico|patologica|rojo|mal)/.test(s)) return "altered";
  return undefined; // inválido
}

export function parseOutcome(cell: unknown): OrthoOutcome | null | undefined {
  const s = fold(cell);
  if (!s) return null;
  if (/^(sin hallazgos|apto|normal|ok|verde|sin indicaciones)/.test(s)) return "clear";
  if (/^(con indicaciones|indicaciones|indicacion|control|amarillo)/.test(s)) return "indications";
  if (/^(derivado|derivada|derivacion|derivar|rojo)/.test(s)) return "referred";
  return undefined;
}

export function parseBool(cell: unknown): boolean | null | undefined {
  const s = fold(cell);
  if (!s) return null;
  if (["si", "s", "x", "true", "1", "yes"].includes(s)) return true;
  if (["no", "n", "false", "0"].includes(s)) return false;
  return undefined;
}

export function parseBloodType(cell: unknown): string | null | undefined {
  const s = String(cell ?? "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/^O/, "0")
    .replace(/POSITIVO|POS|RH\+/, "+")
    .replace(/NEGATIVO|NEG|RH-/, "-");
  if (!s) return null;
  return (BLOOD_TYPES as readonly string[]).includes(s) ? s : undefined;
}
