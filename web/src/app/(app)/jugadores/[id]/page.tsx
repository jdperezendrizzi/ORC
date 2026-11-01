import { notFound } from "next/navigation";
import { PlayerEvolution, ZBar, type MetricSeries } from "@/components/player-charts";
import { HowToRead, InfoHeader } from "@/components/info";
import { CONCEPTS, DOMAIN_INFO, METRIC_INFO } from "@/lib/glossary";
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
  const { supabase, season } = await getViewer();

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
      supabase.from("v_session_best").select("metric_id").eq("player_id", id),
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

  const byDomain = new Map<string, MetricSeries[]>();
  for (const s of series.filter((s) => s.series.length > 0)) {
    byDomain.set(s.domain, [...(byDomain.get(s.domain) ?? []), s]);
  }

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
      <section className="card">
        <InfoHeader title={<h2 className="font-bold">Evolución</h2>} info={CONCEPTS.evolution} className="mb-3" />
        <PlayerEvolution metrics={series.filter((s) => s.series.length > 0)} />
      </section>

      {/* Última medición por dominio */}
      {[...byDomain.entries()].map(([domain, items]) => (
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
        {maturation && age < 19 && (
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
      </div>

      {/* Lesiones */}
      <section className="card">
        <h2 className="font-bold">Historial de lesiones</h2>
        {injuries.length === 0 ? (
          <p className="mt-2 text-sm text-orc-muted">Sin lesiones registradas.</p>
        ) : (
          <ul className="mt-2 divide-y divide-orc-line">
            {injuries.map((i) => (
              <li key={i.id} className="flex items-start justify-between gap-3 py-2 text-sm">
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
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
