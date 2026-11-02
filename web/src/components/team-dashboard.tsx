"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  highlight,
  inGroup,
  mean,
  metricsWithData,
  ranking,
  teamEvolution,
  type DashboardData,
  type DashMetric,
  type Group,
} from "@/lib/dashboard";
import { METRIC_INFO } from "@/lib/glossary";
import { domainLabel, formatDate } from "@/lib/labels";
import { formatValue } from "@/lib/validation";
import { niceAxis } from "./player-charts";
import { InfoHeader } from "./info";

const GROUPS: { value: Group; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "forwards", label: "Forwards" },
  { value: "backs", label: "Backs" },
];
const DEFAULT_METRIC: Record<Group, string[]> = {
  all: ["sprint_10m_s", "yoyo_ir1_distance_m", "cmj_height_cm"],
  forwards: ["back_squat_1rm_kg", "deadlift_1rm_kg", "sprint_10m_s"],
  backs: ["sprint_10m_s", "sprint_40m_s", "agility_505_left_s"],
};
// Colores de grupo (tokens: se adaptan a claro/oscuro)
const COLOR = { forwards: "var(--color-orc-orange)", backs: "var(--color-orc-ink)", all: "var(--color-orc-muted)" };

const fmtUnit = (m: DashMetric) => (m.unit === "n" ? "" : ` ${m.unit}`);

export function TeamDashboard({ data }: { data: DashboardData }) {
  // Arranca en la primera categoría que tenga evaluaciones (no en una vacía).
  const [categoryId, setCategoryId] = useState(() => {
    const catOf = new Map(data.players.map((x) => [x.id, x.categoryId]));
    const withData = new Set(data.points.map(([p]) => catOf.get(p)));
    return data.categories.find((c) => withData.has(c.id))?.id ?? data.categories[0]?.id ?? "";
  });
  const [group, setGroup] = useState<Group>("all");
  const [metricId, setMetricId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState("");

  const catPlayers = useMemo(() => data.players.filter((p) => p.categoryId === categoryId), [data.players, categoryId]);
  const groupPlayers = useMemo(() => catPlayers.filter((p) => inGroup(p, group)), [catPlayers, group]);
  const available = useMemo(() => metricsWithData(data, groupPlayers), [data, groupPlayers]);

  const metric =
    available.find((m) => m.id === metricId) ??
    DEFAULT_METRIC[group].map((c) => available.find((m) => m.code === c)).find(Boolean) ??
    available[0];

  const byCode = (code: string) => data.metrics.find((m) => m.code === code);
  const forwards = catPlayers.filter((p) => p.unit === "forwards");
  const backs = catPlayers.filter((p) => p.unit === "backs");
  const cards = [
    {
      key: "fw",
      title: "Forwards · Fuerza de piernas",
      sub: "Sentadilla 1RM promedio",
      metric: byCode("back_squat_1rm_kg"),
      players: forwards,
      group: "forwards" as Group,
      info: {
        what: "Promedio del 1RM de sentadilla de los forwards en el último testeo. Es el mejor indicador que medimos de la fuerza para empujar en scrum, ruck y maul.",
        read: "No es una medición directa del empuje de scrum: para eso hace falta un trineo o dinamómetro de scrum, que se puede agregar como test.",
      },
    },
    {
      key: "bk",
      title: "Backs · Aceleración",
      sub: "Sprint 10 m promedio",
      metric: byCode("sprint_10m_s"),
      players: backs,
      group: "backs" as Group,
      info: { what: "Promedio del tiempo en 10 m de los backs en el último testeo.", read: "Menos es mejor: si baja, el grupo arranca más rápido." },
    },
    {
      key: "tm",
      title: "Equipo · Resistencia",
      sub: "Yo-Yo IR1 promedio",
      metric: byCode("yoyo_ir1_distance_m"),
      players: catPlayers,
      group: "all" as Group,
      info: { what: "Promedio de metros en el Yo-Yo IR1 de todo el plantel en el último testeo.", read: "Más es mejor: capacidad de repetir esfuerzos intensos durante el partido." },
    },
  ];

  if (data.categories.length === 0) return null;

  return (
    <section className="space-y-3" aria-label="Panel del equipo">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-orc-muted">Panel del equipo</h2>
        {data.categories.length > 1 && (
          <select
            aria-label="Categoría"
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setPlayerId("");
            }}
            className="field-input h-10 w-auto text-base"
          >
            {data.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Tarjetas destacadas */}
      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map((c) => {
          const h = highlight(data, c.metric, c.players);
          const m = c.metric;
          return (
            <article key={c.key} className="card space-y-1 p-3">
              <InfoHeader title={c.title} info={c.info} titleClassName="text-sm font-semibold" />
              <p className="text-xs text-orc-muted">{c.sub}</p>
              {m && h.value !== null ? (
                <>
                  <p className="flex items-baseline gap-2">
                    <span className="text-3xl font-black tabular-nums">{formatValue(h.value, m.decimals)}</span>
                    <span className="text-sm text-orc-muted">{m.unit}</span>
                    {h.delta !== null && h.delta !== 0 && (
                      <span className={`ml-auto text-sm font-semibold ${h.improved ? "text-good" : "text-bad"}`}>
                        {h.delta > 0 ? "▲" : "▼"} {formatValue(Math.abs(h.delta), m.decimals)}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-orc-muted">
                    {h.n} jugadores · {h.date ? formatDate(h.date) : ""}
                    {h.previous !== null && ` · antes ${formatValue(h.previous, m.decimals)}`}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setGroup(c.group);
                      setMetricId(m.id);
                    }}
                    className="text-xs font-semibold text-orc-orange-strong hover:underline"
                  >
                    Ver ranking ›
                  </button>
                </>
              ) : (
                <p className="py-2 text-sm text-orc-muted">Sin datos todavía.</p>
              )}
            </article>
          );
        })}
      </div>

      {/* Controles */}
      <div className="card flex flex-wrap items-end gap-3 p-3">
        <div role="group" aria-label="Grupo" className="flex gap-1.5">
          {GROUPS.map((g) => (
            <button
              key={g.value}
              type="button"
              aria-pressed={group === g.value}
              onClick={() => {
                setGroup(g.value);
                setMetricId(null);
              }}
              className="opt h-10 px-4 text-sm"
            >
              {g.label}
            </button>
          ))}
        </div>
        <div className="min-w-48 flex-1">
          <label className="label" htmlFor="dash-metric">
            Métrica
          </label>
          <select
            id="dash-metric"
            value={metric?.id ?? ""}
            onChange={(e) => setMetricId(e.target.value)}
            className="field-input h-10 text-base"
            disabled={available.length === 0}
          >
            {[...new Set(available.map((m) => m.domain))].map((d) => (
              <optgroup key={d} label={domainLabel[d] ?? d}>
                {available
                  .filter((m) => m.domain === d)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.unit})
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      {metric ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <Ranking data={data} metric={metric} players={groupPlayers} />
          <Evolution data={data} metric={metric} players={catPlayers} group={group} />
        </div>
      ) : (
        <p className="card text-sm text-orc-muted">Todavía no hay evaluaciones cargadas para este grupo.</p>
      )}

      {metric && (
        <PlayerQuickView data={data} metric={metric} players={catPlayers} playerId={playerId} onPlayer={setPlayerId} />
      )}
    </section>
  );
}

/** Ranking como gráfico de puntos: más legible que barras cuando los valores están cerca (p.ej. sprint). */
function Ranking({ data, metric, players }: { data: DashboardData; metric: DashMetric; players: DashboardData["players"] }) {
  const [showAll, setShowAll] = useState(false);
  const rows = ranking(data, metric, players);
  const avg = mean(rows.map((r) => r.value));
  if (rows.length === 0) return <p className="card text-sm text-orc-muted">Sin datos de {metric.name}.</p>;
  const values = rows.map((r) => r.value);
  const { ticks } = niceAxis(values, metric.decimals);
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  // Posición: siempre "mejor" a la derecha.
  const pos = (v: number) => {
    const f = (v - lo) / (hi - lo || 1);
    return `${(metric.higherIsBetter ? f : 1 - f) * 100}%`;
  };
  const visible = showAll ? rows : rows.slice(0, 15);

  return (
    <article className="card space-y-3">
      <InfoHeader
        title={<h3 className="font-bold">Ranking · {metric.name}</h3>}
        info={{
          what: `Mejor marca de la temporada de cada jugador. ${METRIC_INFO[metric.code]?.what ?? ""}`,
          read: `${metric.higherIsBetter ? "Más es mejor" : "Menos es mejor"}: los mejores arriba y a la derecha. La línea punteada es el promedio. Naranja = forwards, oscuro = backs.`,
        }}
      />
      <ol className="space-y-1.5">
        {visible.map((r, i) => (
          <li key={r.player.id}>
            <a
              href={`/jugadores/${r.player.id}`}
              className="grid grid-cols-[1.4rem_1fr_auto] items-center gap-x-2 rounded-md px-1 py-0.5 text-sm hover:bg-orc-orange-soft sm:grid-cols-[1.4rem_minmax(0,11rem)_minmax(3rem,1fr)_auto]"
            >
              <span className="text-right text-xs tabular-nums text-orc-muted">{i + 1}</span>
              <span className="truncate" title={r.player.name}>
                {r.player.name}
                {r.player.position && <span className="ml-1 text-xs text-orc-muted">{r.player.position}</span>}
              </span>
              {/* En celular la línea va debajo del nombre, a todo el ancho */}
              <span className="relative col-start-2 col-end-4 row-start-2 h-4 sm:col-start-3 sm:col-end-4 sm:row-start-1" aria-hidden>
                <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-orc-line" />
                {avg !== null && <span className="absolute inset-y-0 border-l-2 border-dashed border-orc-muted/60" style={{ left: pos(avg) }} />}
                <span
                  className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-orc-surface"
                  style={{ left: pos(r.value), background: r.player.unit === "backs" ? COLOR.backs : COLOR.forwards }}
                />
              </span>
              <span className="col-start-3 row-start-1 text-right font-semibold tabular-nums sm:col-start-4">
                {formatValue(r.value, metric.decimals)}
                <span className="text-xs font-normal text-orc-muted">{fmtUnit(metric)}</span>
              </span>
            </a>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-orc-muted">
        <span>
          Promedio: <b className="text-orc-ink">{formatValue(avg, metric.decimals)}{fmtUnit(metric)}</b> · {rows.length} jugadores
        </span>
        {rows.length > 15 && (
          <button type="button" onClick={() => setShowAll((s) => !s)} className="font-semibold text-orc-orange-strong">
            {showAll ? "Ver menos" : `Ver los ${rows.length}`}
          </button>
        )}
      </div>
    </article>
  );
}

function Evolution({ data, metric, players, group }: { data: DashboardData; metric: DashMetric; players: DashboardData["players"]; group: Group }) {
  const rows = teamEvolution(data, metric, players);
  const lines = group === "all" ? (["forwards", "backs"] as const) : ([group] as const);
  const values = rows.flatMap((r) => lines.map((l) => r[l])).filter((v): v is number => v !== null);
  if (rows.length === 0 || values.length === 0) return <p className="card text-sm text-orc-muted">Sin evolución para mostrar.</p>;
  const { ticks } = niceAxis(values, metric.decimals);
  const fmt = (v: number) => formatValue(v, metric.decimals);
  return (
    <article className="card space-y-2">
      <InfoHeader
        title={<h3 className="font-bold">Evolución del equipo · {metric.name}</h3>}
        info={{
          what: "Promedio del grupo en cada testeo de la temporada.",
          read: metric.higherIsBetter ? "Si la línea sube, el grupo mejora." : "Eje invertido: menos es mejor, así que si la línea sube, el grupo mejora.",
        }}
      />
      {rows.length === 1 && <p className="text-xs text-orc-muted">Hay un solo testeo: la evolución aparece con el próximo.</p>}
      <div className="h-56 w-full">
        <ResponsiveContainer>
          <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
            <CartesianGrid stroke="var(--color-orc-line)" vertical={false} />
            <XAxis dataKey="date" tickFormatter={(d: string) => formatDate(d)} fontSize={12} stroke="var(--color-orc-muted)" />
            <YAxis
              reversed={!metric.higherIsBetter}
              domain={[ticks[0], ticks[ticks.length - 1]]}
              ticks={ticks}
              tickFormatter={fmt}
              fontSize={12}
              width={56}
              stroke="var(--color-orc-muted)"
            />
            <Tooltip
              formatter={(v) => (typeof v === "number" ? `${fmt(v)}${fmtUnit(metric)}` : String(v))}
              labelFormatter={(d) => formatDate(String(d), { day: "numeric", month: "long" })}
              contentStyle={{ background: "var(--color-orc-surface)", border: "1px solid var(--color-orc-line)", color: "var(--color-orc-ink)" }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {lines.map((l) => (
              <Line
                key={l}
                type="monotone"
                dataKey={l}
                name={l === "forwards" ? "Forwards" : "Backs"}
                stroke={COLOR[l]}
                strokeWidth={3}
                dot={{ r: 4 }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}

function PlayerQuickView({
  data,
  metric,
  players,
  playerId,
  onPlayer,
}: {
  data: DashboardData;
  metric: DashMetric;
  players: DashboardData["players"];
  playerId: string;
  onPlayer: (id: string) => void;
}) {
  const sorted = [...players].sort((a, b) => a.name.localeCompare(b.name));
  const player = players.find((p) => p.id === playerId);
  const team = teamEvolution(data, metric, players);
  const mine = new Map(data.points.filter(([p, m]) => p === playerId && m === metric.id).map(([, , d, v]) => [d, v]));
  const rows = team.map((r) => ({ date: r.date, jugador: mine.get(r.date) ?? null, categoria: r.all }));
  const values = rows.flatMap((r) => [r.jugador, r.categoria]).filter((v): v is number => v !== null);
  const ticks = values.length ? niceAxis(values, metric.decimals).ticks : [0, 1];
  const fmt = (v: number) => formatValue(v, metric.decimals);

  return (
    <article className="card space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1">
          <label className="label" htmlFor="dash-player">
            Ver un jugador · {metric.name}
          </label>
          <select id="dash-player" value={playerId} onChange={(e) => onPlayer(e.target.value)} className="field-input h-10 text-base">
            <option value="">Elegí un jugador…</option>
            {sorted.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.position ? ` (${p.position})` : ""}
              </option>
            ))}
          </select>
        </div>
        {player && (
          <a href={`/jugadores/${player.id}`} className="btn-ghost h-10">
            Ver perfil completo ›
          </a>
        )}
      </div>
      {player &&
        (mine.size === 0 ? (
          <p className="text-sm text-orc-muted">{player.name} no tiene registros de {metric.name}.</p>
        ) : (
          <div className="h-52 w-full">
            <ResponsiveContainer>
              <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
                <CartesianGrid stroke="var(--color-orc-line)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(d: string) => formatDate(d)} fontSize={12} stroke="var(--color-orc-muted)" />
                <YAxis
                  reversed={!metric.higherIsBetter}
                  domain={[ticks[0], ticks[ticks.length - 1]]}
                  ticks={ticks}
                  tickFormatter={fmt}
                  fontSize={12}
                  width={56}
                  stroke="var(--color-orc-muted)"
                />
                <Tooltip
                  formatter={(v) => (typeof v === "number" ? `${fmt(v)}${fmtUnit(metric)}` : String(v))}
                  labelFormatter={(d) => formatDate(String(d), { day: "numeric", month: "long" })}
                  contentStyle={{ background: "var(--color-orc-surface)", border: "1px solid var(--color-orc-line)", color: "var(--color-orc-ink)" }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="jugador" name={player.name} stroke="var(--color-orc-orange)" strokeWidth={3} dot={{ r: 4 }} connectNulls isAnimationActive={false} />
                <Line type="monotone" dataKey="categoria" name="Promedio categoría" stroke="var(--color-orc-muted)" strokeDasharray="5 4" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ))}
    </article>
  );
}
