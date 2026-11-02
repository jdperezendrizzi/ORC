import { describe, expect, it } from "vitest";
import {
  matchCategory,
  matchPosition,
  parseCsv,
  parseDate,
  parseRoster,
  parseSex,
  toImportPayload,
  type ParseContext,
} from "../import/roster";

const ctx: ParseContext = {
  categories: [
    { id: "c15", code: "M15", name: "Menores de 15" },
    { id: "c17", code: "M17", name: "Menores de 17" },
    { id: "cp", code: "PRIMERA", name: "Primera" },
  ],
  positions: [
    { id: 2, name: "Hooker", short_name: "HK" },
    { id: 9, name: "Medio scrum", short_name: "MS" },
    { id: 12, name: "Primer centro", short_name: "C12" },
  ],
  existing: [
    { id: "p-dni", first_name: "Otro", last_name: "Nombre", birth_date: "2011-01-01", document_id: "50111222" },
    { id: "p-name", first_name: "Tomás", last_name: "García", birth_date: "2011-03-14", document_id: null },
  ],
  today: "2026-11-01",
};

const HEADER = ["Apellido", "Nombre", "Fecha de nacimiento", "Sexo", "Categoría", "Camiseta", "Puesto", "DNI", "Tutor", "Relación", "Consentimiento rendimiento"];

describe("parseDate", () => {
  it("formatos comunes", () => {
    expect(parseDate("14/03/2011")).toBe("2011-03-14");
    expect(parseDate("4-3-2011")).toBe("2011-03-04");
    expect(parseDate("2011-03-14")).toBe("2011-03-14");
    expect(parseDate("14/03/11", new Date("2026-01-01"))).toBe("2011-03-14");
    expect(parseDate("14/03/98", new Date("2026-01-01"))).toBe("1998-03-14");
  });
  it("fechas de Excel (Date y número de serie)", () => {
    expect(parseDate(new Date(Date.UTC(2011, 2, 14)))).toBe("2011-03-14");
    expect(parseDate(40616)).toBe("2011-03-14");
  });
  it("rechaza fechas imposibles o texto", () => {
    expect(parseDate("31/02/2011")).toBeNull();
    expect(parseDate("marzo 2011")).toBeNull();
    expect(parseDate("")).toBeNull();
  });
});

describe("normalización de valores", () => {
  it("sexo", () => {
    expect(parseSex("M")).toBe("male");
    expect(parseSex("Femenino")).toBe("female");
    expect(parseSex("varón")).toBe("male");
    expect(parseSex("x")).toBeNull();
  });
  it("categoría por código, nombre o número", () => {
    expect(matchCategory("M15", ctx.categories)).toBe("c15");
    expect(matchCategory("m-15", ctx.categories)).toBe("c15");
    expect(matchCategory("Menores de 17", ctx.categories)).toBe("c17");
    expect(matchCategory("primera", ctx.categories)).toBe("cp");
    expect(matchCategory("17", ctx.categories)).toBe("c17");
    expect(matchCategory("M21", ctx.categories)).toBeNull();
  });
  it("puesto por número, nombre o abreviatura", () => {
    expect(matchPosition("9", ctx.positions)).toBe(9);
    expect(matchPosition("hooker", ctx.positions)).toBe(2);
    expect(matchPosition("C12", ctx.positions)).toBe(12);
    expect(matchPosition("centro", ctx.positions)).toBeNull();
  });
});

describe("parseRoster", () => {
  it("detecta encabezados con o sin tildes y en cualquier orden", () => {
    const r = parseRoster(
      [
        ["Plantel M15 2026"], // título arriba del encabezado
        ["nombre", "APELLIDO", "sexo", "fecha nac", "categoria"],
        ["Lucas", "Ruiz", "M", "20/08/2011", "M15"],
      ],
      ctx,
    );
    expect(r.missingRequired).toEqual([]);
    expect(r.rows[0]).toMatchObject({ line: 3, action: "create", categoryId: "c15" });
    expect(r.rows[0].values).toMatchObject({ first_name: "Lucas", last_name: "Ruiz", birth_date: "2011-08-20", sex: "male" });
  });

  it("avisa columnas obligatorias faltantes", () => {
    const r = parseRoster([["Apellido", "Nombre"], ["Ruiz", "Lucas"]], ctx);
    expect(r.missingRequired).toEqual(["Fecha de nacimiento", "Sexo"]);
  });

  it("coincide con jugadores existentes por DNI o por nombre + nacimiento", () => {
    const r = parseRoster(
      [
        HEADER,
        ["Cambiado", "Nombre", "01/01/2011", "M", "M15", "", "", "50.111.222", "", "", ""],
        ["García", "Tomas", "14/03/2011", "M", "M17", "", "", "", "", "", ""],
      ],
      ctx,
    );
    expect(r.rows.map((x) => [x.action, x.playerId])).toEqual([
      ["update", "p-dni"],
      ["update", "p-name"],
    ]);
  });

  it("errores claros por fila y repetidos dentro de la planilla", () => {
    const r = parseRoster(
      [
        HEADER,
        ["Pérez", "Juan", "31/02/2011", "M", "M15", "", "", "", "", "", ""],
        ["Sosa", "Ana", "10/10/2010", "X", "M21", "", "", "", "", "", ""],
        ["Ruiz", "Lucas", "20/08/2011", "M", "M15", "", "", "", "Laura", "Madre", ""],
        ["ruiz", "lucas", "20/08/2011", "M", "M15", "", "", "", "Laura", "Madre", ""],
      ],
      ctx,
    );
    expect(r.rows[0].errors.join(" ")).toMatch(/Fecha de nacimiento inválida/);
    expect(r.rows[1].errors.join(" ")).toMatch(/Sexo no reconocido.*Categoría desconocida|Categoría desconocida/);
    expect(r.rows[2].action).toBe("create");
    expect(r.rows[3].errors.join(" ")).toMatch(/Repetido en la planilla \(igual a la fila 4\)/);
  });

  it("consentimientos: menor sin tutor es error; «Sí» usa la fecha de hoy con aviso", () => {
    const r = parseRoster(
      [
        HEADER,
        ["Ruiz", "Lucas", "20/08/2011", "M", "M15", "", "", "", "", "", "01/03/2026"],
        ["Paz", "Leo", "20/08/2011", "M", "M15", "", "", "", "Ana Paz", "madre", "Sí"],
        ["Mayor", "Juan", "20/08/1999", "M", "Primera", "", "", "", "", "", "05/02/2026"],
      ],
      ctx,
    );
    expect(r.rows[0].errors.join(" ")).toMatch(/hace falta el tutor/);
    expect(r.rows[1].consents).toEqual([{ type: "performance_data", date: "2026-11-01" }]);
    expect(r.rows[1].warnings.join(" ")).toMatch(/fecha de hoy/);
    expect(r.rows[2]).toMatchObject({ action: "create", minor: false, consents: [{ type: "performance_data", date: "2026-02-05" }] });
  });

  it("toImportPayload excluye las filas con error", () => {
    const r = parseRoster(
      [HEADER, ["Ruiz", "Lucas", "20/08/2011", "M", "M15", "9", "Medio scrum", "", "Laura", "Madre", ""], ["", "", "", "", "", "", "", "", "", "", ""], ["Sin", "Fecha", "", "M", "", "", "", "", "", "", ""]],
      ctx,
    );
    const payload = toImportPayload(r.rows);
    expect(payload).toHaveLength(1);
    expect(payload[0]).toMatchObject({ line: 2, jersey_number: 9, position_id: 9, guardian: { full_name: "Laura", relationship: "madre" } });
  });
});

describe("parseCsv", () => {
  it("separador ; con comillas, BOM y saltos de línea Windows", () => {
    const rows = parseCsv('﻿Apellido;Nombre\r\n"García; Hijo";"Juan ""Pipi"""\r\nRuiz;Lucas');
    expect(rows).toEqual([
      ["Apellido", "Nombre"],
      ["García; Hijo", 'Juan "Pipi"'],
      ["Ruiz", "Lucas"],
    ]);
  });
});
