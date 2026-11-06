import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { attendanceKindLabel, attendanceStatusLabel, type AttendanceRow } from "@/lib/attendance";
import { attendanceInsights, buildAttendanceReport, LOW_PCT, periodFor, reportText, type KindFilter, type Preset } from "@/lib/attendance-report";
import { fetchAll } from "@/lib/fetch-all";
import { formatDate } from "@/lib/labels";
import { canEdit, canView } from "@/lib/modules";
import { getViewer, getViewerCategories, isStaff } from "@/lib/server-data";
import { clubToday } from "@/lib/validation";
import { AttendanceExport } from "./attendance-export";

export const metadata: Metadata = { title: "Resumen de asistencia" };
export const dynamic = "force-dynamic";

const PRESETS: { value: Preset; label: string }[] = [
  { value: "mes", label: "Este mes" },
  { value: "mes-anterior", label: "Mes anterior" },
  { value: "temporada", label: "Temporada" },
  { value: "rango", label: "Otro período" },
];

export default async function AttendanceSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string; periodo?: string; desde?: string; hasta?: string; tipo?: string }>;
}) {
  const sp = await searchParams;
  const { supabase, season, profile, modules } = await getViewer();
  if (!season || !isStaff(profile) || !canView(modules, "attendance")) notFound();
  const categories = await getViewerCategories();
  if (categories.length === 0) return <p className="card">No tenés categorías asignadas.</p>;
  const category = categories.find((c) => c.id === sp.cat) ?? categories[0];
  const preset = (PRESETS.some((p) => p.value === sp.periodo) ? sp.periodo : "mes") as Preset;
  const kind = (["all", "practice", "match"].includes(sp.tipo ?? "") ? sp.tipo : "all") as KindFilter;

  const { data: s } = await supabase.from("seasons").select("starts_on, ends_on").eq("id", season.id).single();
  const today = clubToday();
  const period = periodFor(preset, today, { starts_on: s?.starts_on as string, ends_on: s?.ends_on as string }, { from: sp.desde, to: sp.hasta });

  const [rosterRes, rows] = await Promise.all([
    supabase
      .from("player_season_categories")
      .select("player:players!inner(id, first_name, last_name, active)")
      .eq("season_id", season.id)
      .eq("category_id", category.id),
    fetchAll<AttendanceRow>(
      () =>
        supabase
          .from("attendance")
          .select("id, player_id, category_id, season_id, att_date, kind, status, note")
          .eq("category_id", category.id)
          .gte("att_date", period.from)
          .lte("att_date", period.to)
          .order("id") as never,
    ),
  ]);
  type R = { player: { id: string; first_name: string; last_name: string; active: boolean } };
  const players = ((rosterRes.data ?? []) as unknown as R[])
    .filter((r) => r.player.active)
    .map((r) => ({ id: r.player.id, name: `${r.player.last_name}, ${r.player.first_name}` }));
  const report = buildAttendanceReport(rows, players, { from: period.from, to: period.to, kind });
  const nameOf = new Map(players.map((p) => [p.id, p.name]));
  const detail = rows
    .filter((r) => nameOf.has(r.player_id) && (kind === "all" || r.kind === kind))
    .sort((a, b) => a.att_date.localeCompare(b.att_date) || (nameOf.get(a.player_id) ?? "").localeCompare(nameOf.get(b.player_id) ?? ""))
    .map((r) => ({ date: r.att_date, kind: attendanceKindLabel[r.kind], player: nameOf.get(r.player_id)!, status: attendanceStatusLabel[r.status] }));
  const insights = attendanceInsights(report);
  const text = reportText(report, category.name, period.label, insights);
  // Gráfico: desde la primera semana con asistencia y, como máximo, las últimas 20.
  const firstWithData = report.weeks.findIndex((w) => w.pct !== null);
  const weeks = firstWithData < 0 ? [] : report.weeks.slice(firstWithData).slice(-20);

  return (
    <div className="space-y-4">
      <a href={`/practica?tab=asistencia&categoria=${category.id}`} className="text-sm text-orc-muted">
        ← Asistencia
      </a>
      <header>
        <p className="text-sm text-orc-muted">Temporada {season.name}</p>
        <h1 className="text-2xl font-black">Resumen de asistencia</h1>
      </header>

      <form method="get" className="card grid gap-3 sm:grid-cols-4">
        <label className="block">
          <span className="label">Categoría</span>
          <select name="cat" defaultValue={category.id} className="field-input">
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Período</span>
          <select name="periodo" defaultValue={preset} className="field-input">
            {PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Incluye</span>
          <select name="tipo" defaultValue={kind} className="field-input">
            <option value="all">Prácticas y partidos</option>
            <option value="practice">Sólo prácticas</option>
            <option value="match">Sólo partidos</option>
          </select>
        </label>
        <div className="flex items-end">
          <button type="submit" className="btn-ghost h-11 w-full">
            Ver
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:col-span-4 sm:max-w-md">
          <label className="block">
            <span className="label">Desde (otro período)</span>
            <input type="date" name="desde" defaultValue={period.from} max={today} className="field-input" />
          </label>
          <label className="block">
            <span className="label">Hasta</span>
            <input type="date" name="hasta" defaultValue={period.to} max={today} className="field-input" />
          </label>
        </div>
      </form>

      <section className="grid grid-cols-3 gap-3" aria-label="Totales">
        <div className="card p-3">
          <p className="text-xs text-orc-muted">Asistencia</p>
          <p className="text-2xl font-black tabular-nums">{report.avgPct === null ? "—" : `${report.avgPct}%`}</p>
          <p className="text-xs text-orc-muted">{period.label}</p>
        </div>
        <div className="card p-3">
          <p className="flex items-center gap-1.5 text-xs text-orc-muted">
            <span className="inline-block size-2.5 rounded-sm bg-orc-orange" aria-hidden /> Prácticas ({report.practices})
          </p>
          <p className="text-2xl font-black tabular-nums">{report.practicePct === null ? "—" : `${report.practicePct}%`}</p>
        </div>
        <div className="card p-3">
          <p className="flex items-center gap-1.5 text-xs text-orc-muted">
            <span className="inline-block size-2.5 rounded-sm bg-sky-700 dark:bg-sky-400" aria-hidden /> Partidos ({report.matches})
          </p>
          <p className="text-2xl font-black tabular-nums">{report.matchPct === null ? "—" : `${report.matchPct}%`}</p>
        </div>
      </section>

      {report.practices + report.matches === 0 ? (
        <p className="card text-sm">No se tomó asistencia en {category.name} en este período.</p>
      ) : (
        <>
          {insights.length > 0 && (
            <section className="card space-y-2 border-l-4 border-l-orc-orange" aria-label="Qué nos dice">
              <h2 className="font-bold">Qué nos dice</h2>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {insights.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
              <p className="text-xs text-orc-muted">Lectura automática con reglas simples (sin IA). Son pistas para charlar, no conclusiones.</p>
            </section>
          )}

          <section className="card space-y-2" aria-label="Por semana">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold">Semana a semana</h2>
              <span className="flex gap-3 text-xs">
                {kind !== "match" && (
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block size-3 rounded-sm bg-orc-orange" aria-hidden /> Prácticas
                  </span>
                )}
                {kind !== "practice" && (
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block size-3 rounded-sm bg-sky-700 dark:bg-sky-400" aria-hidden /> Partidos
                  </span>
                )}
              </span>
            </div>
            <ul className="flex h-44 items-end gap-3 overflow-x-auto pb-1">
              {weeks.map((w) => {
                const bars = [
                  ...(kind !== "match" ? [{ key: "p", pct: w.practicePct, n: w.practices, label: "Prácticas", color: "bg-orc-orange" }] : []),
                  ...(kind !== "practice" ? [{ key: "m", pct: w.matchPct, n: w.matches, label: "Partidos", color: "bg-sky-700 dark:bg-sky-400" }] : []),
                ];
                return (
                  <li key={w.weekStart} className="flex h-full min-w-12 flex-1 flex-col items-center justify-end gap-1">
                    <div className="flex h-full w-full items-end justify-center gap-0.5">
                      {bars.map((b) => (
                        <div key={b.key} className="flex h-full flex-1 flex-col items-center justify-end">
                          <span className={`text-[10px] font-semibold tabular-nums ${b.pct !== null && b.pct < LOW_PCT ? "text-red-700 dark:text-red-400" : ""}`}>
                            {b.pct === null ? "" : b.pct}
                          </span>
                          <span
                            className={`w-full rounded-t ${b.pct === null ? "bg-orc-chip" : b.color}`}
                            style={{ height: `${b.pct === null ? 2 : Math.max(3, b.pct * 0.85)}%` }}
                            title={`Semana del ${formatDate(w.weekStart)} · ${b.label}: ${b.pct === null ? "sin datos" : `${b.pct} %`} (${b.n})`}
                            aria-label={`Semana del ${formatDate(w.weekStart)}, ${b.label}: ${b.pct === null ? "sin datos" : `${b.pct} %`}`}
                          />
                        </div>
                      ))}
                    </div>
                    <span className="text-[10px] text-orc-muted">{formatDate(w.weekStart)}</span>
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-orc-muted">
              Asistencia de cada semana (desde el lunes), en %. En rojo, menos de {LOW_PCT} %.
              {report.weeks.length - Math.max(firstWithData, 0) > 20 && " Se muestran las últimas 20 semanas."}
            </p>
          </section>

          <section className="card overflow-x-auto p-0">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="bg-orc-black text-left text-xs uppercase tracking-wide text-white">
                <tr>
                  <th className="px-3 py-2">Jugador</th>
                  <th className="px-3 py-2 text-right">Pres.</th>
                  <th className="px-3 py-2 text-right">Aus.</th>
                  <th className="px-3 py-2 text-right">Just.</th>
                  {kind === "all" && <th className="px-3 py-2 text-right">Práct.</th>}
                  {kind === "all" && <th className="px-3 py-2 text-right">Partidos</th>}
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-orc-line">
                {report.players.map((p) => {
                  const low = p.pct !== null && p.pct < LOW_PCT;
                  return (
                    <tr key={p.id} className="hover:bg-orc-orange-soft">
                      <td className="px-3 py-2">
                        <a href={`/jugadores/${p.id}`} className="font-semibold hover:underline">
                          {p.name}
                        </a>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{p.present}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{p.absent}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{p.excused}</td>
                      {kind === "all" && (
                        <td className="px-3 py-2 text-right tabular-nums text-orc-muted">{p.practicePct === null ? "—" : `${p.practicePct}%`}</td>
                      )}
                      {kind === "all" && (
                        <td className="px-3 py-2 text-right tabular-nums text-orc-muted">{p.matchPct === null ? "—" : `${p.matchPct}%`}</td>
                      )}
                      <td className={`px-3 py-2 text-right font-bold tabular-nums ${low ? "text-red-700 dark:text-red-400" : ""}`}>
                        {p.pct === null ? "—" : `${p.pct}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="border-t border-orc-line px-3 py-2 text-xs text-orc-muted">
              Asistencia % = presentes / (presentes + ausentes); las justificadas no cuentan. De menor a mayor.
            </p>
          </section>
        </>
      )}

      {canEdit(modules, "sharing") ? (
        <AttendanceExport
          report={report}
          detail={detail}
          text={text}
          insights={insights}
          categoryId={category.id}
          categoryName={category.name}
          periodLabel={period.label}
          seasonName={season.name}
        />
      ) : (
        <p className="card text-sm text-orc-muted">Para exportar o compartir hace falta el permiso «Compartir».</p>
      )}
    </div>
  );
}
