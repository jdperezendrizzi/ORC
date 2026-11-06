import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { attendanceKindLabel, attendanceStatusLabel, type AttendanceRow } from "@/lib/attendance";
import { buildAttendanceReport, LOW_PCT, periodFor, reportText, type KindFilter, type Preset } from "@/lib/attendance-report";
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
  const text = reportText(report, category.name, period.label);
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
          <p className="text-xs text-orc-muted">Prácticas</p>
          <p className="text-2xl font-black tabular-nums">{report.practices}</p>
        </div>
        <div className="card p-3">
          <p className="text-xs text-orc-muted">Partidos</p>
          <p className="text-2xl font-black tabular-nums">{report.matches}</p>
        </div>
      </section>

      {report.practices + report.matches === 0 ? (
        <p className="card text-sm">No se tomó asistencia en {category.name} en este período.</p>
      ) : (
        <>
          <section className="card space-y-2" aria-label="Por semana">
            <h2 className="font-bold">Semana a semana</h2>
            <ul className="flex h-40 items-end gap-2 overflow-x-auto pb-1">
              {weeks.map((w) => (
                <li key={w.weekStart} className="flex h-full min-w-10 flex-1 flex-col items-center justify-end gap-1">
                  <span className="text-xs font-semibold tabular-nums">{w.pct === null ? "" : `${w.pct}%`}</span>
                  <span
                    className={`w-full rounded-t ${w.pct === null ? "bg-orc-chip" : w.pct < LOW_PCT ? "bg-red-600" : "bg-orc-orange"}`}
                    style={{ height: `${w.pct === null ? 4 : Math.max(4, w.pct)}%` }}
                    title={`Semana del ${formatDate(w.weekStart)}: ${w.practices} prácticas, ${w.matches} partidos`}
                  />
                  <span className="text-[10px] text-orc-muted">{formatDate(w.weekStart)}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-orc-muted">
              Asistencia de cada semana (desde el lunes). En rojo, menos de {LOW_PCT} %.
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
                  <th className="px-3 py-2 text-right">%</th>
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
