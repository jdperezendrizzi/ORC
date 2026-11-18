import { describe, expect, it } from "vitest";
import {
  bmiOf,
  campaignLabel,
  currentCampaign,
  parseBloodType,
  parseBool,
  parseCampaign,
  parseOutcome,
  parseRegionStatus,
} from "../ortho";
import { ORTHO_IMPORT_COLUMNS, parseOrtho, toOrthoPayload, type OrthoPlayerRef } from "../import/ortho";

describe("ortho helpers", () => {
  it("campaña", () => {
    expect(campaignLabel(2026)).toBe("2026-2027");
    expect(currentCampaign("2026-11-24")).toBe(2026);
    expect(currentCampaign("2027-02-10")).toBe(2026);
    expect(currentCampaign("2027-05-10")).toBe(2027);
    for (const s of ["2025", "2025-2026", "2025/26", "25/26", " 2025 - 2026 "]) expect(parseCampaign(s)).toBe(2025);
    expect(parseCampaign(2025)).toBe(2025);
    expect(parseCampaign("hola")).toBeNull();
  });
  it("IMC", () => {
    expect(bmiOf(60, 170)).toBe(20.8);
    expect(bmiOf(null, 170)).toBeNull();
  });
  it("estados, resultado, sí/no y grupo sanguíneo", () => {
    expect(parseRegionStatus("Normal")).toBe("normal");
    expect(parseRegionStatus("a controlar")).toBe("observe");
    expect(parseRegionStatus("ALTERADO")).toBe("altered");
    expect(parseRegionStatus("")).toBeNull();
    expect(parseRegionStatus("raro")).toBeUndefined();
    expect(parseOutcome("Sin hallazgos")).toBe("clear");
    expect(parseOutcome("Con indicaciones")).toBe("indications");
    expect(parseOutcome("Derivado")).toBe("referred");
    expect(parseOutcome("x")).toBeUndefined();
    expect(parseBool("Sí")).toBe(true);
    expect(parseBool("NO")).toBe(false);
    expect(parseBool("tal vez")).toBeUndefined();
    expect(parseBloodType("O+")).toBe("0+");
    expect(parseBloodType("a negativo")).toBe("A-");
    expect(parseBloodType("AB+")).toBe("AB+");
    expect(parseBloodType("Z")).toBeUndefined();
  });
});

describe("parseOrtho", () => {
  const players: OrthoPlayerRef[] = [
    { id: "p1", first_name: "Tomás", last_name: "García", birth_date: "2014-03-14", document_id: "50111222", has_medical_consent: true },
    { id: "p2", first_name: "Juan", last_name: "Pérez", birth_date: "2013-01-01", document_id: null, has_medical_consent: true },
    { id: "p3", first_name: "Juan", last_name: "Pérez", birth_date: "2015-05-05", document_id: null, has_medical_consent: true },
    { id: "p4", first_name: "Sin", last_name: "Firma", birth_date: "2014-01-01", document_id: null, has_medical_consent: false },
  ];
  const H = ["Apellido", "Nombre", "DNI", "Fecha de nacimiento", "Campaña", "Peso (kg)", "Altura (cm)", "Rodillas estado", "Resultado", "Grupo sanguíneo", "Seguimiento médico hasta el alta", "Columna"];

  it("identifica por DNI, por nombre y fecha, y valida", () => {
    const r = parseOrtho(
      [
        ["Evaluaciones 2025"],
        H,
        ["GARCIA", "TOMAS", "50.111.222", "", "2025-2026", "42,5", 148, "a controlar", "Con indicaciones", "O+", "Si", "Normal"],
        ["Pérez", "Juan", "", "05/05/2015", "", "", "", "", "Derivado", "", "", ""],
        ["Pérez", "Juan", "", "", "", "", "", "", "", "", "", ""],
        ["Firma", "Sin", "", "", "", "", "", "Mal", "rarísimo", "", "", ""],
        ["Nadie", "Fulano", "", "", "", "", "", "", "", "", "", ""],
        ["García", "Tomás", "", "", "2025", "", "", "", "", "", "", ""],
      ],
      players,
      2026,
    );
    expect(r.headerLine).toBe(2);
    expect(r.missingRequired).toEqual([]);
    const [a, b, c, d, e, f] = r.rows;
    expect(a.playerId).toBe("p1");
    expect(a.campaign).toBe(2025);
    expect(a.values).toMatchObject({ weight_kg: 42.5, height_cm: 148, knees_status: "observe", outcome: "indications", blood_type: "0+", followed_to_discharge: true, spine_status: "normal" });
    expect(a.errors).toEqual([]);
    expect(b.playerId).toBe("p3");
    expect(b.campaign).toBe(2026); // la elegida al importar
    expect(c.errors.join()).toMatch(/más de un jugador/);
    expect(d.errors.join()).toMatch(/consentimiento de salud/);
    expect(d.errors.join()).toMatch(/Resultado/);
    expect(e.errors.join()).toMatch(/No encontré/);
    expect(f.errors.join()).toMatch(/Repetido/);
    const payload = toOrthoPayload(r.rows);
    expect(payload.map((p) => p.player_id)).toEqual(["p1", "p3"]);
    expect(payload[0]).toMatchObject({ line: 3, campaign: 2025, outcome: "indications" });
  });

  it("valida rangos numéricos y avisa si no hay encabezado", () => {
    const r = parseOrtho([["Apellido", "Nombre", "Peso (kg)"], ["García", "Tomás", 500]], players, 2026);
    expect(r.rows[0].errors.join()).toMatch(/fuera de rango/);
    expect(parseOrtho([["x"]], players, 2026).headerLine).toBe(-1);
  });

  it("la plantilla reconoce todos sus propios encabezados", () => {
    const r = parseOrtho([ORTHO_IMPORT_COLUMNS.map((c) => c.header), ["García", "Tomás"]], players, 2026);
    expect(r.ignoredHeaders).toEqual([]);
  });
});
