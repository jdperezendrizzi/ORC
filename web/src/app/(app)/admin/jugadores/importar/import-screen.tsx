"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  COLUMNS,
  parseCsv,
  parseRoster,
  toImportPayload,
  type ParseContext,
  type ParseResult,
  type ParsedRow,
} from "@/lib/import/roster";
import { formatDate } from "@/lib/labels";
import { importRoster, type ImportOutcome } from "../../actions";

type Props = Omit<ParseContext, "today"> & { today: string; seasonName: string };

const ACTION_LABEL: Record<ParsedRow["action"], { text: string; tone: string }> = {
  create: { text: "Nuevo", tone: "tone-green" },
  update: { text: "Actualiza", tone: "tone-sky" },
  error: { text: "Error", tone: "tone-red" },
};

export function ImportScreen({ categories, positions, existing, today, seasonName }: Props) {
  const ctx = useMemo<ParseContext>(() => ({ categories, positions, existing, today }), [categories, positions, existing, today]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [version, setVersion] = useState(`${seasonName}-v1`);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [pending, startTransition] = useTransition();

  async function downloadTemplate() {
    const { default: writeExcelFile } = await import("write-excel-file/browser");
    const header = COLUMNS.map((c) => c.header);
    const plantel = [header, COLUMNS.map((c) => c.example[0]), COLUMNS.map((c) => c.example[1])];
    const ayuda = [
      ["Columna", "Qué poner"],
      ...COLUMNS.map((c) => [c.header + (c.required ? " (obligatoria)" : ""), c.help]),
      [null, null],
      ["Categorías válidas", "Código"],
      ...categories.map((c) => [c.name, c.code]),
      [null, null],
      ["Puestos válidos", "Número"],
      ...positions.map((p) => [p.name, String(p.id)]),
    ];
    await writeExcelFile([
      { sheet: "Plantel", data: plantel, columns: header.map(() => ({ width: 22 })) },
      { sheet: "Ayuda", data: ayuda, columns: [{ width: 34 }, { width: 90 }] },
    ]).toFile(`plantilla-plantel-${seasonName}.xlsx`);
  }

  async function onFile(file: File | undefined) {
    setOutcome(null);
    setReadError(null);
    setResult(null);
    if (!file) return;
    setFileName(file.name);
    try {
      let sheet: unknown[][];
      if (/\.csv$/i.test(file.name) || file.type === "text/csv") {
        sheet = parseCsv(await file.text());
      } else if (/\.xlsx$/i.test(file.name)) {
        const { readSheet } = await import("read-excel-file/browser");
        sheet = (await readSheet(file)) as unknown[][];
      } else {
        setReadError("Formato no soportado. Guardá la planilla como Excel (.xlsx) o CSV.");
        return;
      }
      const parsed = parseRoster(sheet, ctx);
      if (parsed.headerLine < 0) {
        setReadError("No encontré la fila de encabezados: tiene que haber una columna «Apellido» en las primeras 10 filas.");
        return;
      }
      setResult(parsed);
    } catch {
      setReadError("No pude leer el archivo. ¿Es un Excel válido? Si es .xls (Excel viejo), guardalo como .xlsx.");
    }
  }

  const rows = result?.rows ?? [];
  const valid = rows.filter((r) => r.action !== "error");
  const counts = {
    create: rows.filter((r) => r.action === "create").length,
    update: rows.filter((r) => r.action === "update").length,
    error: rows.filter((r) => r.action === "error").length,
    warn: rows.filter((r) => r.action !== "error" && r.warnings.length > 0).length,
  };
  const visible = onlyProblems ? rows.filter((r) => r.errors.length || r.warnings.length) : rows;
  const blocked = Boolean(result?.missingRequired.length);

  function doImport() {
    startTransition(async () => {
      setOutcome(await importRoster(toImportPayload(rows), version));
    });
  }

  if (outcome?.ok) {
    const o = outcome.ok;
    return (
      <section className="card space-y-3">
        <h2 className="text-lg font-bold">Importación terminada</h2>
        <ul className="grid gap-2 sm:grid-cols-4">
          <Stat n={o.created} label="jugadores nuevos" />
          <Stat n={o.updated} label="actualizados" />
          <Stat n={o.guardians} label="tutores cargados" />
          <Stat n={o.consents} label="consentimientos" />
        </ul>
        <div className="flex flex-wrap gap-3">
          <Link href="/admin/jugadores" className="btn-primary">
            Ver jugadores
          </Link>
          <Link href="/admin" className="btn-ghost">
            Ver pendientes
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="card space-y-3">
        <h2 className="text-lg font-bold">Importar plantel desde Excel</h2>
        <ol className="space-y-3">
          <li className="flex flex-wrap items-center gap-3">
            <Step n={1} />
            <span className="min-w-0 flex-1">
              <b>Descargá la plantilla</b> y completala (una fila por jugador). La hoja «Ayuda» explica cada columna y lista las
              categorías y puestos válidos.
            </span>
            <button type="button" onClick={() => void downloadTemplate()} className="btn-ghost">
              Descargar plantilla .xlsx
            </button>
          </li>
          <li className="flex flex-wrap items-center gap-3">
            <Step n={2} />
            <span className="min-w-0 flex-1">
              <b>Subí el archivo</b> (.xlsx o .csv). También sirve una planilla propia si tiene columnas «Apellido», «Nombre»,
              «Fecha de nacimiento» y «Sexo».
            </span>
            <label className="btn-primary cursor-pointer">
              Elegir archivo
              <input
                type="file"
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                className="sr-only"
                onChange={(e) => void onFile(e.target.files?.[0])}
              />
            </label>
          </li>
          <li className="flex items-center gap-3">
            <Step n={3} />
            <span>
              <b>Revisá la vista previa</b> e importá. Se carga todo junto o nada: si algo falla, no queda el plantel a medias.
              Los jugadores que ya existen (mismo DNI, o mismo nombre y fecha de nacimiento) se actualizan, no se duplican.
            </span>
          </li>
        </ol>
        {fileName && <p className="text-sm text-orc-muted">Archivo: {fileName}</p>}
        {readError && <p className="chip tone-red px-3 py-1 text-sm">{readError}</p>}
      </section>

      {result && (
        <section className="space-y-3">
          {blocked ? (
            <p className="card tone-red text-sm">
              Faltan columnas obligatorias: <b>{result.missingRequired.join(", ")}</b>. Agregalas al Excel (podés copiar el
              encabezado de la plantilla) y volvé a subirlo.
            </p>
          ) : (
            <>
              <div className="card flex flex-wrap items-center gap-2">
                <span className="chip tone-green text-sm">{counts.create} nuevos</span>
                <span className="chip tone-sky text-sm">{counts.update} a actualizar</span>
                {counts.warn > 0 && <span className="chip tone-amber text-sm">{counts.warn} con avisos</span>}
                {counts.error > 0 && <span className="chip tone-red text-sm">{counts.error} con errores (no se importan)</span>}
                <label className="ml-auto flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} className="size-4 accent-orc-orange" />
                  Ver sólo filas con errores o avisos
                </label>
              </div>
              {result.ignoredHeaders.length > 0 && (
                <p className="text-sm text-orc-muted">Columnas que no se usan: {result.ignoredHeaders.join(", ")}.</p>
              )}

              <div className="card overflow-x-auto p-0">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-orc-black text-left text-xs uppercase tracking-wide text-white">
                    <tr>
                      <th className="px-3 py-2">Fila</th>
                      <th className="px-3 py-2">Estado</th>
                      <th className="px-3 py-2">Jugador</th>
                      <th className="px-3 py-2">Nacimiento</th>
                      <th className="px-3 py-2">Categoría</th>
                      <th className="px-3 py-2">Tutor</th>
                      <th className="px-3 py-2">Consentimientos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-orc-line align-top">
                    {visible.map((r) => (
                      <tr key={r.line} className={r.action === "error" ? "bg-bad/5" : ""}>
                        <td className="px-3 py-2 tabular-nums text-orc-muted">{r.line}</td>
                        <td className="px-3 py-2">
                          <span className={`chip ${ACTION_LABEL[r.action].tone}`}>{ACTION_LABEL[r.action].text}</span>
                        </td>
                        <td className="px-3 py-2">
                          <span className="font-semibold">
                            {r.values.last_name || "—"}, {r.values.first_name || "—"}
                          </span>
                          {[...r.errors.map((m) => ["e", m]), ...r.warnings.map((m) => ["w", m])].map(([k, m], i) => (
                            <p key={i} className={`mt-0.5 text-xs ${k === "e" ? "font-semibold text-bad" : "text-warn"}`}>
                              {k === "e" ? "✕ " : "! "}
                              {m}
                            </p>
                          ))}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {/^\d{4}-\d{2}-\d{2}$/.test(r.values.birth_date)
                            ? formatDate(r.values.birth_date, { day: "2-digit", month: "2-digit", year: "numeric" })
                            : r.values.birth_date || "—"}
                          {r.minor && <span className="block text-xs text-orc-muted">menor</span>}
                        </td>
                        <td className="px-3 py-2">
                          {categories.find((c) => c.id === r.categoryId)?.name ?? (r.values.category || "—")}
                          {r.jersey && <span className="block text-xs text-orc-muted">#{r.jersey}</span>}
                        </td>
                        <td className="px-3 py-2">{r.values.guardian_name || "—"}</td>
                        <td className="px-3 py-2">
                          {r.consents.length === 0
                            ? "—"
                            : r.consents.map((c) => (
                                <span key={c.type} className="block">
                                  {c.type === "performance_data" ? "Rendimiento" : "Salud"} ·{" "}
                                  {formatDate(c.date, { day: "2-digit", month: "2-digit", year: "2-digit" })}
                                </span>
                              ))}
                        </td>
                      </tr>
                    ))}
                    {visible.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-3 py-6 text-center text-orc-muted">
                          {rows.length === 0 ? "La planilla no tiene filas con datos." : "No hay filas con problemas."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="card flex flex-wrap items-end gap-3">
                <div>
                  <label className="label" htmlFor="doc_version">
                    Versión del formulario de consentimiento
                  </label>
                  <input id="doc_version" value={version} onChange={(e) => setVersion(e.target.value)} className="field-input h-10 text-base" />
                </div>
                <p className="min-w-48 flex-1 text-sm text-orc-muted">
                  {counts.error > 0
                    ? "Las filas con error no se importan. Podés corregirlas en el Excel y volver a subirlo (lo ya importado se actualiza, no se duplica)."
                    : "Todo listo para importar."}
                </p>
                <button type="button" disabled={valid.length === 0 || pending} onClick={doImport} className="btn-primary">
                  {pending ? "Importando…" : `Importar ${valid.length} jugador${valid.length === 1 ? "" : "es"}`}
                </button>
              </div>
              {outcome?.error && (
                <p role="alert" className="card tone-red text-sm">
                  {outcome.error}
                </p>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-orc-orange font-black text-orc-black" aria-hidden>
      {n}
    </span>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <li className="rounded-lg border border-orc-line p-3">
      <p className="text-3xl font-black tabular-nums">{n}</p>
      <p className="text-sm text-orc-muted">{label}</p>
    </li>
  );
}
