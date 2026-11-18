"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { parseCsv } from "@/lib/import/roster";
import { ORTHO_IMPORT_COLUMNS, parseOrtho, type OrthoParseResult, type OrthoPlayerRef } from "@/lib/import/ortho";
import { campaignLabel, outcomeOf } from "@/lib/ortho";
import { importOrtho, type OrthoImportOutcome } from "../actions";

export function OrthoImportScreen({ players, defaultCampaign }: { players: OrthoPlayerRef[]; defaultCampaign: number }) {
  const [campaign, setCampaign] = useState(defaultCampaign);
  const [sheet, setSheet] = useState<unknown[][] | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [outcome, setOutcome] = useState<OrthoImportOutcome | null>(null);
  const [pending, startTransition] = useTransition();
  const result: OrthoParseResult | null = sheet ? parseOrtho(sheet, players, campaign) : null;
  const campaigns = Array.from({ length: 6 }, (_, i) => defaultCampaign + 1 - i);

  async function downloadTemplate() {
    const { default: writeExcelFile } = await import("write-excel-file/browser");
    const header = ORTHO_IMPORT_COLUMNS.map((c) => c.header);
    const ayuda = [
      ["Columna", "Qué poner"],
      ...ORTHO_IMPORT_COLUMNS.map((c) => [c.header + (c.required ? " (obligatoria)" : ""), c.help]),
      [null, null],
      ["Una fila por jugador y por campaña.", "Las columnas vacías no borran lo que ya estaba cargado."],
    ];
    await writeExcelFile([
      { sheet: "Evaluaciones", data: [header, ORTHO_IMPORT_COLUMNS.map((c) => c.example)], columns: header.map(() => ({ width: 22 })) },
      { sheet: "Ayuda", data: ayuda, columns: [{ width: 40 }, { width: 90 }] },
    ]).toFile("plantilla-evaluacion-ortopedica.xlsx");
  }

  async function onFile(file: File | undefined) {
    setOutcome(null);
    setReadError(null);
    setSheet(null);
    if (!file) return;
    setFileName(file.name);
    try {
      let rows: unknown[][];
      if (/\.csv$/i.test(file.name) || file.type === "text/csv") rows = parseCsv(await file.text());
      else if (/\.xlsx$/i.test(file.name)) {
        const { readSheet } = await import("read-excel-file/browser");
        rows = (await readSheet(file)) as unknown[][];
      } else {
        setReadError("Formato no soportado. Guardá la planilla como Excel (.xlsx) o CSV.");
        return;
      }
      if (parseOrtho(rows, players, campaign).headerLine < 0) {
        setReadError("No encontré la fila de encabezados: tiene que haber una columna «Apellido» en las primeras 10 filas.");
        return;
      }
      setSheet(rows);
    } catch {
      setReadError("No pude leer el archivo. ¿Es un Excel válido? Si es .xls (Excel viejo), guardalo como .xlsx.");
    }
  }

  const rows = result?.rows ?? [];
  const valid = rows.filter((r) => !r.errors.length);
  const errors = rows.length - valid.length;
  const visible = onlyProblems ? rows.filter((r) => r.errors.length || r.warnings.length) : rows;
  const blocked = Boolean(result?.missingRequired.length);

  if (outcome?.ok) {
    return (
      <section className="card space-y-3">
        <h2 className="text-lg font-bold">Importación terminada</h2>
        <p>
          <b>{outcome.ok.created}</b> evaluaciones nuevas · <b>{outcome.ok.updated}</b> actualizadas.
        </p>
        <Link href="/ortopedia" className="btn-primary">
          Ver evaluaciones
        </Link>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="card space-y-3">
        <h1 className="text-xl font-black">Importar evaluaciones ortopédicas</h1>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>
            <b>Descargá la plantilla</b> y completala: una fila por jugador. Sirve para pasar las fichas en papel y para cargar
            las de años anteriores. La hoja «Ayuda» explica cada columna.
          </li>
          <li>
            <b>Elegí la campaña</b> si la planilla no trae la columna «Campaña».
          </li>
          <li>
            <b>Subí el archivo</b>, revisá la vista previa e importá. Si un jugador ya tiene la evaluación de esa campaña, se
            completa con lo nuevo (las celdas vacías no borran nada).
          </li>
        </ol>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void downloadTemplate()} className="btn-ghost">
            Descargar plantilla .xlsx
          </button>
          <select value={campaign} onChange={(e) => setCampaign(Number(e.target.value))} aria-label="Campaña" className="field-input h-11 w-auto text-base">
            {campaigns.map((c) => (
              <option key={c} value={c}>
                Campaña {campaignLabel(c)}
              </option>
            ))}
          </select>
          <label className="btn-primary cursor-pointer">
            Elegir archivo
            <input
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="sr-only"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
          </label>
        </div>
        {fileName && <p className="text-sm text-orc-muted">Archivo: {fileName}</p>}
        {readError && <p className="chip tone-red px-3 py-1 text-sm">{readError}</p>}
      </section>

      {result &&
        (blocked ? (
          <p className="card tone-red text-sm">
            Faltan columnas obligatorias: <b>{result.missingRequired.join(", ")}</b>.
          </p>
        ) : (
          <section className="space-y-3">
            <div className="card flex flex-wrap items-center gap-2">
              <span className="chip tone-green text-sm">{valid.length} para importar</span>
              {errors > 0 && <span className="chip tone-red text-sm">{errors} con errores (no se importan)</span>}
              <label className="ml-auto flex items-center gap-2 text-sm">
                <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} className="size-4 accent-orc-orange" />
                Ver sólo filas con errores o avisos
              </label>
            </div>
            {result.ignoredHeaders.length > 0 && <p className="text-sm text-orc-muted">Columnas que no se usan: {result.ignoredHeaders.join(", ")}.</p>}
            <div className="card overflow-x-auto p-0">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-orc-black text-left text-xs uppercase tracking-wide text-white">
                  <tr>
                    <th className="px-3 py-2">Fila</th>
                    <th className="px-3 py-2">Jugador</th>
                    <th className="px-3 py-2">Campaña</th>
                    <th className="px-3 py-2">Datos</th>
                    <th className="px-3 py-2">Resultado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-orc-line align-top">
                  {visible.map((r) => {
                    const out = outcomeOf(r.values.outcome as string);
                    return (
                      <tr key={r.line} className={r.errors.length ? "bg-bad/5" : ""}>
                        <td className="px-3 py-2 tabular-nums text-orc-muted">{r.line}</td>
                        <td className="px-3 py-2">
                          <span className="font-semibold">{r.name}</span>
                          {[...r.errors.map((m) => ["e", m]), ...r.warnings.map((m) => ["w", m])].map(([k, m], i) => (
                            <p key={i} className={`mt-0.5 text-xs ${k === "e" ? "font-semibold text-bad" : "text-warn"}`}>
                              {k === "e" ? "✕ " : "! "}
                              {m}
                            </p>
                          ))}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">{r.campaign ? campaignLabel(r.campaign) : "—"}</td>
                        <td className="px-3 py-2 tabular-nums">{Object.keys(r.values).length} campos</td>
                        <td className="px-3 py-2">{out ? `${out.icon} ${out.label}` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="card flex flex-wrap items-center gap-3">
              <p className="min-w-48 flex-1 text-sm text-orc-muted">
                {errors > 0 ? "Las filas con error no se importan: corregilas en el Excel y volvé a subirlo." : "Todo listo para importar."} Se carga todo junto o nada.
              </p>
              <button
                type="button"
                disabled={valid.length === 0 || pending}
                onClick={() => startTransition(async () => setOutcome(await importOrtho(rows)))}
                className="btn-primary"
              >
                {pending ? "Importando…" : `Importar ${valid.length} evaluaci${valid.length === 1 ? "ón" : "ones"}`}
              </button>
            </div>
            {outcome?.error && (
              <p role="alert" className="card tone-red text-sm">
                {outcome.error}
              </p>
            )}
          </section>
        ))}
    </div>
  );
}
