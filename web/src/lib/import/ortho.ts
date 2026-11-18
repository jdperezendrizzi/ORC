// Lectura de la planilla de evaluaciones ortopédicas (Excel/CSV).
// Funciones puras: vista previa en el navegador y tests.

import { norm, parseDate } from "./roster";
import {
  ORTHO_FIELDS,
  parseBloodType,
  parseBool,
  parseCampaign,
  parseOutcome,
  parseRegionStatus,
  type OrthoField,
} from "../ortho";

export interface OrthoPlayerRef {
  id: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  document_id: string | null;
  has_medical_consent: boolean;
}

interface Col {
  key: string;
  header: string;
  aliases: string[];
  kind: OrthoField["kind"] | "id" | "campaign" | "blood" | "plain";
  required?: boolean;
  help: string;
  example: string;
}

const helpFor = (f: OrthoField): string => {
  switch (f.kind) {
    case "status":
      return "Normal, A controlar o Alterado.";
    case "outcome":
      return "Sin hallazgos, Con indicaciones o Derivado. Es lo único que ve el profe.";
    case "bool":
      return "Sí o No.";
    case "number":
      return `Número${f.unit ? ` en ${f.unit}` : ""}.`;
    case "date":
      return "Día/mes/año.";
    default:
      return f.hint ?? "Texto libre.";
  }
};
const EXAMPLES: Record<string, string> = {
  evaluated_on: "24/11/2026",
  examiner: "Dr. Moure",
  weight_kg: "42,5",
  height_cm: "148",
  knees_status: "A controlar",
  knees_notes: "Genu valgo leve",
  spine_status: "Normal",
  hips_status: "Normal",
  feet_status: "Normal",
  sit_reach_cm: "-3",
  outcome: "Con indicaciones",
  indications: "Fortalecimiento de cuádriceps",
};

export const ORTHO_IMPORT_COLUMNS: Col[] = [
  { key: "last_name", header: "Apellido", aliases: ["apellidos"], kind: "id", required: true, help: "Obligatorio.", example: "GARCÍA" },
  { key: "first_name", header: "Nombre", aliases: ["nombres"], kind: "id", required: true, help: "Obligatorio.", example: "TOMÁS" },
  { key: "document_id", header: "DNI", aliases: ["documento"], kind: "id", help: "Recomendado: es lo que mejor identifica al jugador.", example: "50111222" },
  { key: "birth_date", header: "Fecha de nacimiento", aliases: ["fecha nac", "nacimiento", "fecha nacimiento"], kind: "id", help: "Opcional: ayuda si hay dos jugadores con el mismo nombre.", example: "14/03/2014" },
  {
    key: "campaign",
    header: "Campaña",
    aliases: ["campana", "año", "ano", "temporada"],
    kind: "campaign",
    help: "Año en que se hizo la evaluación: 2025 (= 2025-2026). Si falta, se usa la que elijas al importar.",
    example: "2026",
  },
  { key: "blood_type", header: "Grupo sanguíneo", aliases: ["grupo sanguineo", "grupo y factor", "grupo"], kind: "blood", help: "A+, A-, B+, B-, AB+, AB-, 0+ o 0-.", example: "0+" },
  { key: "health_insurance", header: "Obra social", aliases: ["prepaga", "cobertura"], kind: "plain", help: "Texto.", example: "OSDE" },
  { key: "health_insurance_number", header: "N° afiliado", aliases: ["afiliado", "nro afiliado", "numero de afiliado", "n afiliado"], kind: "plain", help: "Texto.", example: "123456789" },
  ...ORTHO_FIELDS.map((f) => ({
    key: f.key,
    header: f.header ?? f.label,
    aliases: [f.label, ...(f.aliases ?? [])],
    kind: f.kind,
    help: helpFor(f),
    example: EXAMPLES[f.key] ?? "",
  })),
];

export interface OrthoParsedRow {
  line: number;
  name: string;
  playerId: string | null;
  campaign: number | null;
  values: Record<string, string | number | boolean | null>;
  errors: string[];
  warnings: string[];
}

export interface OrthoParseResult {
  rows: OrthoParsedRow[];
  headerLine: number;
  missingRequired: string[];
  ignoredHeaders: string[];
}

const toNumber = (cell: unknown): number | null | undefined => {
  if (typeof cell === "number") return cell;
  const s = String(cell ?? "").trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};

export function parseOrtho(sheet: unknown[][], players: OrthoPlayerRef[], defaultCampaign: number): OrthoParseResult {
  let headerLine = -1;
  for (let i = 0; i < Math.min(sheet.length, 10) && headerLine < 0; i++) {
    if ((sheet[i] ?? []).map(norm).includes("apellido")) headerLine = i;
  }
  const required = ORTHO_IMPORT_COLUMNS.filter((c) => c.required).map((c) => c.header);
  if (headerLine < 0) return { rows: [], headerLine: -1, missingRequired: required, ignoredHeaders: [] };

  const colIndex = new Map<string, number>();
  const ignoredHeaders: string[] = [];
  (sheet[headerLine] ?? []).forEach((cell, idx) => {
    const h = norm(cell);
    if (!h) return;
    const col = ORTHO_IMPORT_COLUMNS.find((c) => norm(c.header) === h || c.aliases.map(norm).includes(h));
    if (col && !colIndex.has(col.key)) colIndex.set(col.key, idx);
    else ignoredHeaders.push(String(cell));
  });
  const missingRequired = ORTHO_IMPORT_COLUMNS.filter((c) => c.required && !colIndex.has(c.key)).map((c) => c.header);

  const byDoc = new Map<string, OrthoPlayerRef>();
  for (const p of players) if (p.document_id) byDoc.set(norm(p.document_id).replace(/\s/g, ""), p);
  const byName = new Map<string, OrthoPlayerRef[]>();
  for (const p of players) {
    const k = `${norm(p.last_name)}|${norm(p.first_name)}`;
    byName.set(k, [...(byName.get(k) ?? []), p]);
  }

  const seen = new Map<string, number>();
  const rows: OrthoParsedRow[] = [];
  for (let i = headerLine + 1; i < sheet.length; i++) {
    const raw = sheet[i] ?? [];
    if (raw.every((c) => norm(c) === "")) continue;
    const cell = (k: string) => {
      const idx = colIndex.get(k);
      return idx === undefined ? null : raw[idx];
    };
    const text = (k: string) => String(cell(k) ?? "").trim();
    const errors: string[] = [];
    const warnings: string[] = [];
    const last = text("last_name");
    const first = text("first_name");
    const name = `${last}, ${first}`;

    // Jugador: DNI → nombre (+ fecha de nacimiento si hay homónimos)
    let player: OrthoPlayerRef | null = null;
    const doc = text("document_id").replace(/[.\s]/g, "");
    if (doc) player = byDoc.get(norm(doc)) ?? null;
    if (!player) {
      const cands = byName.get(`${norm(last)}|${norm(first)}`) ?? [];
      const birth = parseDate(cell("birth_date"));
      const narrowed = birth ? cands.filter((p) => p.birth_date === birth) : cands;
      if (narrowed.length === 1) {
        player = narrowed[0];
        if (doc) warnings.push("El DNI no coincide con el de la app: se identificó por nombre.");
      } else if (narrowed.length > 1) errors.push("Hay más de un jugador con ese nombre: agregá el DNI o la fecha de nacimiento.");
      else errors.push("No encontré al jugador en la app. Revisá apellido, nombre o DNI.");
    }
    if (player && !player.has_medical_consent) errors.push("No tiene firmado el consentimiento de salud.");

    // Campaña
    let campaign: number | null = defaultCampaign;
    if (text("campaign")) {
      campaign = parseCampaign(cell("campaign"));
      if (campaign === null) errors.push(`Campaña inválida: «${text("campaign")}». Poné el año, por ejemplo 2025.`);
    }

    const values: OrthoParsedRow["values"] = {};
    for (const col of ORTHO_IMPORT_COLUMNS) {
      if (col.kind === "id" || col.kind === "campaign" || !colIndex.has(col.key)) continue;
      const c = cell(col.key);
      const t = text(col.key);
      if (!t && typeof c !== "number") continue;
      let v: string | number | boolean | null | undefined;
      switch (col.kind) {
        case "status":
          v = parseRegionStatus(c);
          if (v === undefined) errors.push(`${col.header}: «${t}» no es válido (Normal, A controlar o Alterado).`);
          break;
        case "outcome":
          v = parseOutcome(c);
          if (v === undefined) errors.push(`Resultado: «${t}» no es válido (Sin hallazgos, Con indicaciones o Derivado).`);
          break;
        case "bool":
          v = parseBool(c);
          if (v === undefined) errors.push(`${col.header}: poné Sí o No.`);
          break;
        case "blood":
          v = parseBloodType(c);
          if (v === undefined) errors.push(`Grupo sanguíneo inválido: «${t}».`);
          break;
        case "date":
          v = parseDate(c);
          if (!v) errors.push(`${col.header}: fecha inválida «${t}».`);
          break;
        case "number": {
          v = toNumber(c);
          const f = ORTHO_FIELDS.find((x) => x.key === col.key);
          if (v === undefined) errors.push(`${col.header}: «${t}» no es un número.`);
          else if (v !== null && f && ((f.min !== undefined && v < f.min) || (f.max !== undefined && v > f.max)))
            errors.push(`${col.header}: ${v} está fuera de rango (${f.min} a ${f.max}).`);
          break;
        }
        default:
          v = t;
      }
      if (v !== undefined && v !== null) values[col.key] = v;
    }
    if (!Object.keys(values).length) warnings.push("La fila no trae datos de la evaluación.");

    if (player && campaign) {
      const k = `${player.id}|${campaign}`;
      const prev = seen.get(k);
      if (prev) errors.push(`Repetido: el mismo jugador y campaña ya está en la fila ${prev}.`);
      else seen.set(k, i + 1);
    }

    rows.push({ line: i + 1, name, playerId: player?.id ?? null, campaign, values, errors, warnings });
  }
  return { rows, headerLine: headerLine + 1, missingRequired, ignoredHeaders };
}

/** Filas válidas en el formato de public.import_ortho_evaluations. */
export function toOrthoPayload(rows: OrthoParsedRow[]) {
  return rows
    .filter((r) => !r.errors.length && r.playerId && r.campaign)
    .map((r) => ({ line: r.line, player_id: r.playerId, campaign: r.campaign, ...r.values }));
}
