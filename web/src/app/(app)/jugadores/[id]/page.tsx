import { notFound } from "next/navigation";
import { methodLabel, type MeasureMethod } from "@/lib/field-tests/protocol";
import { objectiveAreaLabel, objectiveState, playerProgress } from "@/lib/objectives";
import type { Objective, ObjectiveCheck } from "@/lib/types";
import { canEdit, canView } from "@/lib/modules";
import { ABSENCE_STREAK, absenceStreak, attendanceKindLabel, attendancePct, countByStatus, type AttendanceRow } from "@/lib/attendance";
import { PlayerEvolution, ZBar, type MetricSeries } from "@/components/player-charts";
import { HowToRead, InfoHeader } from "@/components/info";
import { CONCEPTS, DOMAIN_INFO, METRIC_INFO } from "@/lib/glossary";
import { ShareReportButton } from "@/components/share-report";
import { reportMetrics, type ReportData } from "@/lib/report/player-report";
import { clubToday } from "@/lib/validation";
import { getViewer } from "@/lib/server-data";
import {
  bodyRegionLabel,
  domainLabel,
  formatDate,
  injuryStatusLabel,
  injuryStatusTone,
  injuryTypeLabel,
  lineLabel,
  maturityLabel,
} from "@/lib/labels";
import { ageOn, formatValue } from "@/lib/validation";
import type { AcwrRow, ComparisonPoint, Injury, Maturation, Position, TestMetric, TestType } from "@/lib/types";

export const dynamic = "force-dynamic";

// Insumos que no se muestran como métrica propia (se ven sus derivadas).
const HIDDEN_ROLES = new Set(["load", "reps", "sitting_height"]);
const HIDDEN_CODES = new Set(["maturity_offset", "yoyo_ir1_level"]);

const consentLabel: Record<string, string> = {
  performance_data: "Rendimiento",
  medical_data: "Salud",
  gps_tracking: "GPS",
  image_use: "Imagen",
  data_sharing_family: "Familia",
};

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, season, profile, modules } = await getViewer();
  const can = { perf: canView(modules, "performance"), well: canView(modules, "wellness"), att: canView(modules, "attendance"), inj: canView(modules, "injuries"), injEdit: canEdit(modules, "injuries"), share: canEdit(modules, "sharing"), promo: canView(modules, "promotion"), objectives: canView(modules, "objectives") };

  const { data: player } = await supabase
    .from("players")
    .select("id, first_name, last_name, birth_date, sex, primary_position_id")
    .eq("id", id)
    .maybeSingle();
  if (!player) notFound(); // también si RLS no lo deja ver

  const [pscRes, positionsRes, typesRes, metricsRes, bestRes, matRes, injRes, consRes, wellRes, acwrRes] =
    await Promise.all([
      supabase
        .from("player_season_categories")
        .select("position_id, jersey_number, category:categories(id, name)")
        .eq("player_id", id)
        .eq("season_id", season?.id ?? "")
        .maybeSingle(),
      supabase.from("positions").select("id, name, short_name, unit, line"),
      supabase.from("test_types").select("id, code, name, domain, sort_order"),
      supabase
        .from("test_metrics")
        .select("id, test_type_id, code, name, unit, higher_is_better, decimals, sort_order, input_role, derivation"),
      supabase.from("v_session_best").select("metric_id, methods, protocol_versions, devices").eq("player_id", id),
      supabase
        .from("v_maturation")
        .select("session_date, age, maturity_offset, age_at_phv, maturity_status")
        .eq("player_id", id)
        .order("session_date", { ascending: false })
        .limit(1),
      supabase
        .from("injuries")
        .select("id, occurred_on, context, body_region, injury_type, status, expected_return, actual_return, days_lost, summary")
        .eq("player_id", id)
        .is("deleted_at", null)
        .order("occurred_on", { ascending: false }),
      supabase.from("consents").select("consent_type, revoked_at").eq("player_id", id).is("revoked_at", null),
      supabase
        .from("wellness_logs")
        .select("log_date, sleep_hours, fatigue, soreness, wellness_score, session_rpe, srpe_load")
        .eq("player_id", id)
        .is("deleted_at", null)
        .order("log_date", { ascending: false })
        .limit(7),
      supabase
        .from("v_player_acwr")
        .select("day, load, acute_load, chronic_load, acwr, chronic_window_complete")
        .eq("player_id", id)
        .order("day", { ascending: false })
        .limit(1),
    ]);

  const positions = new Map(((positionsRes.data ?? []) as Position[]).map((p) => [p.id, p]));
  const types = new Map(((typesRes.data ?? []) as TestType[]).map((t) => [t.id, t]));
  type M = TestMetric & { input_role: string | null };
  const metricsWithData = new Set((bestRes.data ?? []).map((b) => b.metric_id as string));
  const displayMetrics = ((metricsRes.data ?? []) as M[])
    .filter((m) => metricsWithData.has(m.id) && !HIDDEN_CODES.has(m.code) && !HIDDEN_ROLES.has(m.input_role ?? ""))
    .sort(
      (a, b) =>
        (types.get(a.test_type_id)?.sort_order ?? 0) - (types.get(b.test_type_id)?.sort_order ?? 0) ||
        a.sort_order - b.sort_order,
    );

  // Series que mezclan métodos, versiones de protocolo o equipos: se avisa (nunca en silencio).
  const howMeasured = new Map<string, { methods: Set<string>; versions: Set<string>; devices: Set<string> }>();
  for (const b of (bestRes.data ?? []) as { metric_id: string; methods: string | null; protocol_versions: string | null; devices: string | null }[]) {
    const h = howMeasured.get(b.metric_id) ?? { methods: new Set(), versions: new Set(), devices: new Set() };
    for (const x of (b.methods ?? "").split(",").filter(Boolean)) h.methods.add(x);
    for (const x of (b.protocol_versions ?? "").split(",").filter(Boolean)) h.versions.add(x);
    for (const x of (b.devices ?? "").split(",").filter(Boolean)) h.devices.add(x);
    howMeasured.set(b.metric_id, h);
  }
  const mixedNotes = displayMetrics.flatMap((m) => {
    const h = howMeasured.get(m.id);
    if (!h) return [];
    const parts = [
      h.methods.size > 1 && `métodos distintos (${[...h.methods].map((x) => methodLabel[x as MeasureMethod] ?? x).join(", ")})`,
      h.versions.size > 1 && `versiones de protocolo distintas (v${[...h.versions].sort().join(", v")})`,
      h.devices.size > 1 && `${h.devices.size} celulares distintos`,
    ].filter(Boolean);
    return parts.length ? [`${m.name}: la serie mezcla ${parts.join(" y ")}. No son del todo comparables.`] : [];
  });

  // Serie + comparación por métrica (RPC con z-scores vs. categoría/unidad/línea/puesto).
  const series: MetricSeries[] = await Promise.all(
    displayMetrics.map(async (m) => {
      const { data } = await supabase.rpc("player_comparison", { p_player_id: id, p_metric_id: m.id });
      return {
        id: m.id,
        code: m.code,
        name: m.name,
        unit: m.unit,
        decimals: m.decimals,
        higherIsBetter: m.higher_is_better,
        domain: types.get(m.test_type_id)?.domain ?? "",
        series: (data ?? []) as ComparisonPoint[],
      };
    }),
  );

  type Psc = { position_id: number | null; jersey_number: number | null; category: { id: string; name: string } | null };
  const psc = pscRes.data as Psc | null;
  const positionId = psc?.position_id ?? player.primary_position_id;
  const position = positionId ? positions.get(positionId) : undefined;
  const age = ageOn(player.birth_date);
  const maturation = (matRes.data?.[0] ?? null) as Maturation | null;
  const injuries = (injRes.data ?? []) as Injury[];
  const activeConsents = new Set((consRes.data ?? []).map((c) => c.consent_type as string));
  const acwr = (acwrRes.data?.[0] ?? null) as AcwrRow | null;
  const wellness = wellRes.data ?? [];

  // Asistencia de la temporada (registro básico del club)
  const { data: attData } = season
    ? await supabase
        .from("attendance")
        .select("id, player_id, category_id, season_id, att_date, kind, status, note")
        .eq("player_id", id)
        .eq("season_id", season.id)
        .order("att_date", { ascending: false })
    : { data: [] };
  const attendance = (attData ?? []) as AttendanceRow[];
  const att = countByStatus(attendance);
  const attPct = attendancePct(attendance);
  const streak = absenceStreak(attendance);
  const lastAbsences = attendance.filter((a) => a.status !== "present").slice(0, 5);

  // Objetivos por jugador (desde la categoría que configura el admin)
  const objCatId = psc?.category?.id;
  const [{ data: pObjs }, { data: pChecks }] =
    can.objectives && objCatId && season
      ? await Promise.all([
          supabase
            .from("objectives")
            .select("id, category_id, scope, area, title, look_for, exercise_name, exercise_description, exercise_url, sort_order")
            .eq("category_id", objCatId)
            .eq("scope", "player")
            .eq("active", true)
            .order("sort_order"),
          supabase
            .from("objective_checks")
            .select("id, objective_id, season_id, check_date, player_id, achieved, note")
            .eq("player_id", id)
            .eq("season_id", season.id),
        ])
      : [{ data: [] }, { data: [] }];
  const playerObjectives = (pObjs ?? []) as Objective[];
  const playerChecks = (pChecks ?? []) as ObjectiveCheck[];
  const objToday = clubToday();

  const byDomain = new Map<string, MetricSeries[]>();
  for (const s of series.filter((s) => s.series.length > 0)) {
    byDomain.set(s.domain, [...(byDomain.get(s.domain) ?? []), s]);
  }

  // Informe para compartir: sólo rendimiento; menores necesitan el
  // consentimiento "Acceso de la familia" (la base lo vuelve a verificar).
  const report: ReportData = {
    playerName: `${player.first_name} ${String(player.last_name).replace(" (demo)", "")}`,
    subtitle: [psc?.category?.name, position?.name, `${age} años`].filter(Boolean).join(" · "),
    seasonName: season?.name ?? "",
    issuedBy: profile?.full_name ?? "",
    issuedOn: clubToday(),
    minor: age < 18,
    metrics: reportMetrics(
      series.map((s) => ({
        code: s.code,
        name: s.name,
        unit: s.unit,
        decimals: s.decimals,
        higherIsBetter: s.higherIsBetter,
        domain: s.domain,
        series: s.series.map((p) => ({
          date: p.session_date,
          value: Number(p.value),
          z: p.z_category === null ? null : Number(p.z_category),
        })),
      })),
    ),
  };
  const shareBlocked =
    age < 18 && !activeConsents.has("data_sharing_family")
      ? "Para compartir el informe de un menor hace falta el consentimiento «Acceso de la familia» firmado por el tutor. Lo registra el admin."
      : report.metrics.length === 0
        ? "Todavía no hay evaluaciones de rendimiento para armar el informe."
        : null;

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <header className="overflow-hidden rounded-xl bg-orc-black text-white">
        <div className="flex items-center gap-4 p-4">
          <span className="grid size-16 shrink-0 place-items-center rounded-full border-2 border-orc-orange text-2xl font-black">
            {psc?.jersey_number ?? positionId ?? "–"}
          </span>
          <div className="min-w-0 flex-1">
            {psc?.category && (
              <a href={`/categorias/${psc.category.id}`} className="text-sm text-orc-orange">
                ← {psc.category.name}
              </a>
            )}
            <h1 className="truncate text-2xl font-black">
              {player.first_name} {player.last_name}
            </h1>
            <p className="text-sm text-white/70">
              {age} años · {position ? `${position.name} · ${lineLabel[position.line]}` : "Sin puesto"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1 border-t border-white/10 px-4 py-2">
          {Object.entries(consentLabel).map(([code, label]) => (
            <span
              key={code}
              className={`chip ${activeConsents.has(code) ? "bg-white/10 text-white" : "bg-amber-400 text-orc-black"}`}
              title={activeConsents.has(code) ? "Consentimiento vigente" : "Sin consentimiento"}
            >
              {activeConsents.has(code) ? "✓" : "✕"} {label}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-3">
          {can.share && <ShareReportButton playerId={id} data={report} blockedReason={shareBlocked} />}
          {psc?.category && can.promo && (
            <a href={`/jugadores/${id}/pase`} className="btn-ghost h-10 border-white/30 bg-transparent text-white hover:bg-white/10">
              Evaluación de pase →
            </a>
          )}
        </div>
      </header>

      <HowToRead
        title="¿Cómo leer este perfil?"
        items={[CONCEPTS.zscore, CONCEPTS.groups, CONCEPTS.delta, CONCEPTS.evolution, CONCEPTS.relative, CONCEPTS.consents]}
        footer={
          <a href="/guia" className="text-sm font-semibold text-orc-orange-strong">
            Ver la guía completa de lo que medimos →
          </a>
        }
      />

      {/* Evolución */}
      {can.perf && (
      <section className="card">
        <InfoHeader title={<h2 className="font-bold">Evolución</h2>} info={CONCEPTS.evolution} className="mb-3" />
        <PlayerEvolution metrics={series.filter((s) => s.series.length > 0)} />
        {mixedNotes.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm" aria-label="Avisos de comparación">
            {mixedNotes.map((n) => (
              <li key={n} className="rounded-lg border border-amber-500 px-3 py-2">
                <span aria-hidden>⚠ </span>
                {n}
              </li>
            ))}
          </ul>
        )}
      </section>
      )}

      {/* Última medición por dominio */}
      {can.perf && [...byDomain.entries()].map(([domain, items]) => (
        <section key={domain}>
          <h2 className="text-sm font-bold uppercase tracking-wide text-orc-muted">{domainLabel[domain] ?? domain}</h2>
          {DOMAIN_INFO[domain] && <p className="mb-2 text-sm text-orc-muted">{DOMAIN_INFO[domain]}</p>}
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((m) => {
              const last = m.series[m.series.length - 1];
              const prev = m.series.length > 1 ? m.series[m.series.length - 2] : null;
              const delta = prev ? Number(last.value) - Number(prev.value) : null;
              const improved = delta !== null && delta !== 0 && (delta > 0) === m.higherIsBetter;
              return (
                <li key={m.id} className="card space-y-2">
                  <InfoHeader
                    title={m.name}
                    info={METRIC_INFO[m.code]}
                    titleClassName="text-sm font-semibold"
                    aside={<span className="shrink-0 text-xs text-orc-muted">{formatDate(last.session_date)}</span>}
                  />
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black tabular-nums">{formatValue(Number(last.value), m.decimals)}</span>
                    {m.unit !== "n" && <span className="text-sm text-orc-muted">{m.unit}</span>}
                    {delta !== null && delta !== 0 && (
                      <span className={`ml-auto text-sm font-semibold ${improved ? "text-good" : "text-bad"}`}>
                        {delta > 0 ? "▲" : "▼"} {formatValue(Math.abs(delta), m.decimals)}
                      </span>
                    )}
                  </div>
                  {last.value_per_kg !== null && (
                    <p className="text-xs text-orc-muted">
                      Relativo: <strong>{formatValue(Number(last.value_per_kg), 2)}</strong> × peso corporal
                    </p>
                  )}
                  <ZBar z={last.z_category === null ? null : Number(last.z_category)} label="vs. categoría" />
                  {last.z_line !== null && <ZBar z={Number(last.z_line)} label="vs. su línea" />}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Maduración */}
        {can.perf && maturation && age < 19 && (
          <section className="card">
            <InfoHeader title={<h2 className="font-bold">Maduración</h2>} info={CONCEPTS.maturation} />
            <p className="mt-1 text-xs text-orc-muted">Estimación de Mirwald · {formatDate(maturation.session_date)}</p>
            <p className="mt-3 text-xl font-black">{maturityLabel[maturation.maturity_status]}</p>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-orc-muted">Años desde el PHV</dt>
                <dd className="font-semibold tabular-nums">{formatValue(Number(maturation.maturity_offset), 2)}</dd>
              </div>
              <div>
                <dt className="text-orc-muted">Edad estimada de PHV</dt>
                <dd className="font-semibold tabular-nums">{formatValue(Number(maturation.age_at_phv), 1)} años</dd>
              </div>
            </dl>
            {maturation.maturity_status === "circa_phv" && (
              <p className="mt-3 rounded-lg bg-orc-orange-soft p-2 text-xs">
                Está en el pico de crecimiento: más riesgo de lesiones por sobrecarga. Ajustar volumen e impacto.
              </p>
            )}
          </section>
        )}

        {/* Carga y bienestar */}
        {can.well && (
        <section className="card">
          <InfoHeader
            title={<h2 className="font-bold">Carga y bienestar</h2>}
            info={{
              what: `${CONCEPTS.acwr.what} ${CONCEPTS.acwr.read}`,
              read: `${CONCEPTS.wellness.what} ${CONCEPTS.rpe.read}`,
            }}
          />
          {acwr && acwr.acwr !== null ? (
            <div className="mt-3 flex items-baseline gap-3">
              <span
                className={`text-3xl font-black tabular-nums ${
                  acwr.acwr !== null && (acwr.acwr > 1.5 || acwr.acwr < 0.8) ? "text-bad" : ""
                }`}
              >
                {formatValue(acwr.acwr === null ? null : Number(acwr.acwr), 2)}
              </span>
              <span className="text-sm text-orc-muted">
                ACWR (agudo/crónico){!acwr.chronic_window_complete && " · menos de 28 días de datos"}
              </span>
            </div>
          ) : (
            <p className="mt-2 text-sm text-orc-muted">
              {acwr ? "Sin carga registrada en los últimos 28 días: no se puede calcular el ACWR." : "Sin registros de carga."}
            </p>
          )}
          {wellness.length > 0 && (
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-xs text-orc-muted">
                <tr>
                  <th className="py-1">Día</th>
                  <th className="py-1 text-right">Sueño</th>
                  <th className="py-1 text-right">Wellness</th>
                  <th className="py-1 text-right">RPE</th>
                  <th className="py-1 text-right">Carga</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-orc-line tabular-nums">
                {wellness.map((w) => (
                  <tr key={w.log_date as string}>
                    <td className="py-1">{formatDate(w.log_date as string, { weekday: "short", day: "numeric" })}</td>
                    <td className="py-1 text-right">{formatValue(w.sleep_hours as number | null, 1)} h</td>
                    <td className={`py-1 text-right ${(w.wellness_score as number) < 15 ? "font-bold text-bad" : ""}`}>
                      {w.wellness_score ?? "—"}/25
                    </td>
                    <td className="py-1 text-right">{w.session_rpe ?? "—"}</td>
                    <td className="py-1 text-right">{w.srpe_load ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        )}
      </div>

      {/* Asistencia */}
      {can.att && (
      <section className="card space-y-2">
        <h2 className="font-bold">Asistencia de la temporada</h2>
        {attendance.length === 0 ? (
          <p className="text-sm text-orc-muted">Todavía no se tomó asistencia.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="text-3xl font-black tabular-nums">{attPct ?? "—"}%</span>
              <span className="text-sm text-orc-muted">
                {att.present} presentes · {att.absent} ausentes · {att.excused} justificadas
              </span>
            </div>
            {streak.count >= ABSENCE_STREAK && (
              <p className="rounded-lg tone-amber px-3 py-2 text-sm">Faltó a las últimas {streak.count} prácticas sin justificar.</p>
            )}
            {lastAbsences.length > 0 && (
              <p className="text-sm text-orc-muted">
                Últimas faltas:{" "}
                {lastAbsences
                  .map((a) => `${formatDate(a.att_date)} (${a.status === "excused" ? "justificada" : "sin justificar"}${a.kind === "match" ? `, ${attendanceKindLabel.match.toLowerCase()}` : ""})`)
                  .join(" · ")}
              </p>
            )}
            <p className="text-xs text-orc-muted">Asistencia % = presentes sobre presentes + ausentes; las justificadas no cuentan.</p>
          </>
        )}
      </section>
      )}

      {/* Objetivos del jugador */}
      {can.objectives && playerObjectives.length > 0 && (
        <section className="card space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-bold">Objetivos del jugador</h2>
            <span className="text-sm">
              <b className="text-lg tabular-nums">{playerProgress(playerObjectives, playerChecks, id, objToday).done}</b> de {playerObjectives.length} logrados
            </span>
          </div>
          <ul className="divide-y divide-orc-line">
            {playerObjectives.map((o) => {
              const st = objectiveState(playerChecks, o.id, objToday, id);
              return (
                <li key={o.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                  <span>
                    <span className="font-semibold">{o.title}</span>
                    <span className="block text-xs text-orc-muted">{objectiveAreaLabel[o.area]}</span>
                  </span>
                  {st.achieved ? (
                    <span className="chip tone-green shrink-0 text-xs">Logrado {st.firstAchieved ? formatDate(st.firstAchieved) : ""}</span>
                  ) : st.lastDate ? (
                    <span className="chip tone-amber shrink-0 text-xs">No logrado ({formatDate(st.lastDate)})</span>
                  ) : (
                    <span className="chip shrink-0 text-xs">Pendiente</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Lesiones */}
      {can.inj && (
      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">Historial de lesiones</h2>
          {can.injEdit && (
            <a href={`/lesiones/nueva?jugador=${id}`} className="text-sm font-semibold text-orc-orange-strong">
              + Registrar lesión
            </a>
          )}
        </div>
        {injuries.length === 0 ? (
          <p className="mt-2 text-sm text-orc-muted">Sin lesiones registradas.</p>
        ) : (
          <ul className="mt-2 divide-y divide-orc-line">
            {injuries.map((i) => (
              <li key={i.id}>
                <a href={`/lesiones/${i.id}`} className="flex items-start justify-between gap-3 py-2 text-sm hover:bg-orc-orange-soft">
                <span>
                  <span className="font-semibold">
                    {injuryTypeLabel[i.injury_type]} · {bodyRegionLabel[i.body_region]}
                  </span>
                  <span className="block text-xs text-orc-muted">
                    {formatDate(i.occurred_on, { day: "numeric", month: "short", year: "numeric" })}
                    {i.days_lost !== null && ` · ${i.days_lost} días fuera`}
                    {i.summary && ` · ${i.summary}`}
                  </span>
                </span>
                <span className={`chip shrink-0 ${injuryStatusTone[i.status]}`}>{injuryStatusLabel[i.status]}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
      )}
    </div>
  );
}
