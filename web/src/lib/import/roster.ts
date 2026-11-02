// Lectura y validación de la planilla de plantel (Excel/CSV).
// Funciones puras: se usan en el navegador (vista previa) y en los tests.

import type { Category, Position } from "../types";

export type ConsentCode = "performance_data" | "medical_data";

export interface ColumnDef {
  key: keyof RowValues;
  header: string;
  aliases: string[];
  required?: boolean;
  example: [string, string];
  help: string;
}

export interface RowValues {
  last_name: string;
  first_name: string;
  birth_date: string; // YYYY-MM-DD
  sex: string; // male | female
  category: string;
  jersey_number: string;
  position: string;
  document_id: string;
  guardian_name: string;
  guardian_relationship: string;
  guardian_phone: string;
  guardian_email: string;
  consent_performance: string;
  consent_medical: string;
}

export const COLUMNS: ColumnDef[] = [
  { key: "last_name", header: "Apellido", aliases: ["apellidos"], required: true, example: ["García", "Pérez"], help: "Obligatorio." },
  { key: "first_name", header: "Nombre", aliases: ["nombres"], required: true, example: ["Tomás", "Juan Cruz"], help: "Obligatorio." },
  {
    key: "birth_date",
    header: "Fecha de nacimiento",
    aliases: ["nacimiento", "fecha nacimiento", "fecha nac", "f nac", "fnac"],
    required: true,
    example: ["14/03/2011", "02/11/2009"],
    help: "Obligatorio. Formato día/mes/año (14/03/2011) o una fecha de Excel.",
  },
  { key: "sex", header: "Sexo", aliases: ["genero", "género"], required: true, example: ["M", "M"], help: "Obligatorio. M o F (también Masculino/Femenino)." },
  {
    key: "category",
    header: "Categoría",
    aliases: ["categoria", "cat"],
    example: ["M15", "M17"],
    help: "Código o nombre: M15, Menores de 15, Primera, Intermedia. Si queda vacío, el jugador no aparece para ningún profe.",
  },
  { key: "jersey_number", header: "Camiseta", aliases: ["numero", "número", "nro", "n camiseta", "dorsal"], example: ["9", "12"], help: "Opcional. Número del 1 al 99." },
  { key: "position", header: "Puesto", aliases: ["posicion", "posición"], example: ["9", "Primer centro"], help: "Opcional. Número del 1 al 15 o nombre (Hooker, Apertura…)." },
  { key: "document_id", header: "DNI", aliases: ["documento", "dni jugador", "nro documento"], example: ["50111222", "48999888"], help: "Opcional (recomendado): evita duplicados al reimportar." },
  { key: "guardian_name", header: "Tutor", aliases: ["tutor nombre", "nombre tutor", "madre/padre", "responsable"], example: ["Laura García", "Martín Pérez"], help: "Obligatorio para menores si se cargan consentimientos." },
  { key: "guardian_relationship", header: "Relación", aliases: ["relacion", "parentesco", "vinculo", "vínculo"], example: ["Madre", "Padre"], help: "Madre, Padre, Tutor legal u Otro." },
  { key: "guardian_phone", header: "Teléfono tutor", aliases: ["telefono tutor", "tel tutor", "celular tutor", "telefono", "teléfono", "celular"], example: ["11 5555-0001", "11 5555-0002"], help: "Opcional." },
  { key: "guardian_email", header: "Email tutor", aliases: ["mail tutor", "email", "mail", "correo"], example: ["laura@mail.com", ""], help: "Opcional." },
  {
    key: "consent_performance",
    header: "Consentimiento rendimiento",
    aliases: ["consentimiento rendimiento", "consent rendimiento", "autorizacion rendimiento", "consentimiento datos"],
    example: ["01/03/2026", "Sí"],
    help: "Fecha de firma (o «Sí» si está firmado y no tenés la fecha: se usa la de hoy). Vacío = sin firmar.",
  },
  {
    key: "consent_medical",
    header: "Consentimiento salud",
    aliases: ["consentimiento salud", "consent salud", "autorizacion salud", "consentimiento medico", "consentimiento médico"],
    example: ["01/03/2026", ""],
    help: "Igual que el anterior, para datos de salud y lesiones.",
  },
];

export type RowAction = "create" | "update" | "error";

export interface ParsedRow {
  line: number;
  values: RowValues;
  action: RowAction;
  playerId: string | null;
  categoryId: string | null;
  positionId: number | null;
  jersey: number | null;
  relationship: string | null;
  consents: { type: ConsentCode; date: string }[];
  minor: boolean;
  errors: string[];
  warnings: string[];
}

export interface ExistingPlayer {
  id: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  document_id: string | null;
}

export interface ParseContext {
  categories: Pick<Category, "id" | "code" | "name">[];
  positions: Pick<Position, "id" | "name" | "short_name">[];
  existing: ExistingPlayer[];
  today: string; // YYYY-MM-DD
}

export interface ParseResult {
  rows: ParsedRow[];
  headerLine: number;
  missingRequired: string[];
  ignoredHeaders: string[];
}

// ---------------------------------------------------------------------
// Normalización
// ---------------------------------------------------------------------
export function norm(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const pad = (n: number) => String(n).padStart(2, "0");

function isoFromParts(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null; // 31/02
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Fecha desde una celda: Date de Excel, número de serie, d/m/a o a-m-d. */
export function parseDate(cell: unknown, today = new Date()): string | null {
  if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
    return isoFromParts(cell.getUTCFullYear(), cell.getUTCMonth() + 1, cell.getUTCDate());
  }
  if (typeof cell === "number" && cell > 1000 && cell < 80000) {
    // Serie de Excel (días desde 1899-12-30)
    const dt = new Date(Date.UTC(1899, 11, 30) + Math.round(cell) * 864e5);
    return isoFromParts(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  const s = String(cell ?? "").trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return isoFromParts(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (m) {
    let y = +m[3];
    if (m[3].length === 2) {
      const cur = today.getFullYear() % 100;
      y += y <= cur ? 2000 : 1900;
    }
    return isoFromParts(y, +m[2], +m[1]); // día/mes/año (formato argentino)
  }
  return null;
}

export function parseSex(cell: unknown): "male" | "female" | null {
  const s = norm(cell);
  if (["m", "masc", "masculino", "varon", "hombre", "h", "male"].includes(s)) return "male";
  if (["f", "fem", "femenino", "mujer", "female"].includes(s)) return "female";
  return null;
}

export function matchCategory(cell: unknown, categories: ParseContext["categories"]): string | null {
  const s = norm(cell);
  if (!s) return null;
  const compact = s.replace(/ /g, "");
  const asCode = compact.replace(/^menoresde/, "m").replace(/^sub/, "m");
  for (const c of categories) {
    const code = norm(c.code).replace(/ /g, "");
    if (code === compact || code === asCode || norm(c.name) === s) return c.id;
  }
  if (/^\d{1,2}$/.test(compact)) {
    const byNumber = categories.find((c) => norm(c.code).replace(/ /g, "") === `m${compact}`);
    if (byNumber) return byNumber.id;
  }
  return null;
}

export function matchPosition(cell: unknown, positions: ParseContext["positions"]): number | null {
  const s = norm(cell);
  if (!s) return null;
  if (/^\d{1,2}$/.test(s)) {
    const n = Number(s);
    return positions.some((p) => p.id === n) ? n : null;
  }
  const p = positions.find((p) => norm(p.name) === s || norm(p.short_name) === s);
  if (p) return p.id;
  // "centro" / "pilar" ambiguos: no se adivina
  return null;
}

export function parseRelationship(cell: unknown): string | null {
  const s = norm(cell);
  if (!s) return null;
  if (["madre", "mama"].includes(s)) return "madre";
  if (["padre", "papa"].includes(s)) return "padre";
  if (["tutor", "tutora", "tutor legal", "tutora legal"].includes(s)) return "tutor_legal";
  return "otro";
}

function parseConsent(cell: unknown, today: string): { date: string | null; error?: string } {
  const s = norm(cell);
  if (!s || ["no", "n", "0", "pendiente"].includes(s)) return { date: null };
  if (["si", "s", "x", "ok", "firmado", "1"].includes(s)) return { date: today };
  const d = parseDate(cell);
  if (!d) return { date: null, error: "no es una fecha ni «Sí»" };
  if (d > today) return { date: null, error: "la fecha de firma es futura" };
  return { date: d };
}

function ageOn(birth: string, on: string): number {
  const [by, bm, bd] = birth.split("-").map(Number);
  const [y, m, d] = on.split("-").map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

const nameKey = (first: string, last: string, birth: string) => `${norm(last)}|${norm(first)}|${birth}`;

// ---------------------------------------------------------------------
// Parseo de la hoja
// ---------------------------------------------------------------------
export function parseRoster(sheet: unknown[][], ctx: ParseContext): ParseResult {
  // Encabezado: primera fila (de las 10 primeras) donde aparecen Apellido y Nombre.
  let headerLine = -1;
  const colIndex = new Map<keyof RowValues, number>();
  const ignoredHeaders: string[] = [];
  for (let i = 0; i < Math.min(sheet.length, 10) && headerLine < 0; i++) {
    const cells = (sheet[i] ?? []).map(norm);
    if (cells.includes("apellido") || cells.includes("apellidos")) headerLine = i;
  }
  if (headerLine < 0) {
    return { rows: [], headerLine: -1, missingRequired: COLUMNS.filter((c) => c.required).map((c) => c.header), ignoredHeaders };
  }
  (sheet[headerLine] ?? []).forEach((cell, idx) => {
    const h = norm(cell);
    if (!h) return;
    const col = COLUMNS.find((c) => norm(c.header) === h || c.aliases.map(norm).includes(h));
    if (col && !colIndex.has(col.key)) colIndex.set(col.key, idx);
    else ignoredHeaders.push(String(cell));
  });
  const missingRequired = COLUMNS.filter((c) => c.required && !colIndex.has(c.key)).map((c) => c.header);

  const byDoc = new Map(ctx.existing.filter((p) => p.document_id).map((p) => [norm(p.document_id), p]));
  const byName = new Map(ctx.existing.map((p) => [nameKey(p.first_name, p.last_name, p.birth_date), p]));
  const seenInFile = new Map<string, number>();
  const rows: ParsedRow[] = [];

  for (let i = headerLine + 1; i < sheet.length; i++) {
    const raw = sheet[i] ?? [];
    if (raw.every((c) => norm(c) === "")) continue; // fila vacía
    const cell = (k: keyof RowValues) => {
      const idx = colIndex.get(k);
      return idx === undefined ? null : raw[idx];
    };
    const text = (k: keyof RowValues) => String(cell(k) ?? "").trim();
    const errors: string[] = [];
    const warnings: string[] = [];

    const birth = parseDate(cell("birth_date"));
    const sex = parseSex(cell("sex"));
    const values: RowValues = {
      last_name: text("last_name"),
      first_name: text("first_name"),
      birth_date: birth ?? text("birth_date"),
      sex: sex ?? text("sex"),
      category: text("category"),
      jersey_number: text("jersey_number"),
      position: text("position"),
      document_id: text("document_id").replace(/[.\s]/g, ""),
      guardian_name: text("guardian_name"),
      guardian_relationship: text("guardian_relationship"),
      guardian_phone: text("guardian_phone"),
      guardian_email: text("guardian_email"),
      consent_performance: text("consent_performance"),
      consent_medical: text("consent_medical"),
    };

    if (!values.last_name) errors.push("Falta el apellido.");
    if (!values.first_name) errors.push("Falta el nombre.");
    if (!birth) errors.push(values.birth_date ? `Fecha de nacimiento inválida: «${values.birth_date}».` : "Falta la fecha de nacimiento.");
    else {
      const age = ageOn(birth, ctx.today);
      if (age < 4 || age > 60) errors.push(`La fecha de nacimiento da ${age} años: revisala.`);
    }
    if (!sex) errors.push(values.sex ? `Sexo no reconocido: «${values.sex}» (usá M o F).` : "Falta el sexo (M o F).");

    const categoryId = matchCategory(values.category, ctx.categories);
    if (values.category && !categoryId) errors.push(`Categoría desconocida: «${values.category}».`);
    if (!values.category) warnings.push("Sin categoría: no lo va a ver ningún profe.");

    const positionId = values.position ? matchPosition(values.position, ctx.positions) : null;
    if (values.position && positionId === null) warnings.push(`Puesto no reconocido («${values.position}»): se deja sin puesto.`);

    let jersey: number | null = null;
    if (values.jersey_number) {
      const n = Number(values.jersey_number);
      if (Number.isInteger(n) && n >= 1 && n <= 99) jersey = n;
      else warnings.push(`Camiseta inválida («${values.jersey_number}»): se deja vacía.`);
    }

    if (values.document_id && !/^\d{6,9}$/.test(values.document_id)) warnings.push(`El DNI «${values.document_id}» no parece válido.`);
    if (values.guardian_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.guardian_email)) {
      warnings.push(`Email del tutor dudoso: «${values.guardian_email}».`);
    }

    const minor = birth ? ageOn(birth, ctx.today) < 18 : false;
    const relationship = values.guardian_name ? (parseRelationship(values.guardian_relationship) ?? "otro") : null;

    const consents: ParsedRow["consents"] = [];
    for (const [key, type, label] of [
      ["consent_performance", "performance_data", "rendimiento"],
      ["consent_medical", "medical_data", "salud"],
    ] as const) {
      const c = parseConsent(cell(key), ctx.today);
      if (c.error) errors.push(`Consentimiento de ${label}: ${c.error}.`);
      else if (c.date) consents.push({ type, date: c.date });
      if (norm(cell(key)) && ["si", "s", "x", "ok", "firmado", "1"].includes(norm(cell(key)))) {
        warnings.push(`Consentimiento de ${label} sin fecha: se registra con la fecha de hoy.`);
      }
    }

    // Duplicados y coincidencias
    let playerId: string | null = null;
    if (birth && values.first_name && values.last_name) {
      const key = nameKey(values.first_name, values.last_name, birth);
      const dupKey = values.document_id ? `dni:${values.document_id}` : key;
      if (seenInFile.has(dupKey)) errors.push(`Repetido en la planilla (igual a la fila ${seenInFile.get(dupKey)}).`);
      else seenInFile.set(dupKey, i + 1);
      const existing = (values.document_id && byDoc.get(norm(values.document_id))) || byName.get(key);
      if (existing) playerId = existing.id;
    }

    if (minor && consents.length > 0 && !values.guardian_name && !playerId) {
      errors.push("Es menor: para registrar consentimientos hace falta el tutor.");
    }
    if (minor && !values.guardian_name && consents.length === 0 && !playerId) {
      warnings.push("Menor sin tutor: no se le van a poder registrar consentimientos hasta cargarlo.");
    }
    if (minor && consents.length > 0 && !values.guardian_name && playerId) {
      warnings.push("Menor sin tutor en la planilla: el consentimiento se asigna al tutor ya cargado (si no tiene, va a fallar).");
    }

    rows.push({
      line: i + 1,
      values,
      action: errors.length ? "error" : playerId ? "update" : "create",
      playerId,
      categoryId,
      positionId,
      jersey,
      relationship,
      consents,
      minor,
      errors,
      warnings,
    });
  }
  return { rows, headerLine: headerLine + 1, missingRequired, ignoredHeaders };
}

/** Filas válidas en el formato que espera la función import_roster de la base. */
export function toImportPayload(rows: ParsedRow[]) {
  return rows
    .filter((r) => r.action !== "error")
    .map((r) => ({
      line: r.line,
      player_id: r.playerId,
      first_name: r.values.first_name,
      last_name: r.values.last_name,
      birth_date: r.values.birth_date,
      sex: r.values.sex,
      category_id: r.categoryId,
      jersey_number: r.jersey,
      position_id: r.positionId,
      document_id: r.values.document_id || null,
      guardian: r.values.guardian_name
        ? {
            full_name: r.values.guardian_name,
            relationship: r.relationship,
            phone: r.values.guardian_phone || null,
            email: r.values.guardian_email || null,
          }
        : null,
      consents: r.consents,
    }));
}

/** Lee un CSV (separado por ; o ,) respetando comillas. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
