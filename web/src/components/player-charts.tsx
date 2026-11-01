"use client";

import { useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ComparisonPoint } from "@/lib/types";
import { formatDate } from "@/lib/labels";
import { formatValue } from "@/lib/validation";
import { METRIC_INFO } from "@/lib/glossary";

export interface MetricSeries {
  id: string;
  code: string;
  name: string;
  unit: string;
  decimals: number;
  higherIsBetter: boolean;
  domain: string;
  series: ComparisonPoint[];
}

/** Evolución del jugador vs. promedio de su categoría y de su línea. */
export function PlayerEvolution({ metrics }: { metrics: MetricSeries[] }) {
  const [selected, setSelected] = useState(metrics[0]?.id);
  const metric = metrics.find((m) => m.id === selected) ?? metrics[0];
  if (!metric) return <p className="text-sm text-orc-muted">Todavía no hay evaluaciones cargadas.</p>;

  const data = metric.series.map((p) => ({
    date: p.session_date,
    jugador: Number(p.value),
    categoria: p.category_mean !== null ? Number(p.category_mean) : null,
    linea: p.line_mean !== null ? Number(p.line_mean) : null,
  }));
  const fmt = (v: number) => formatValue(v, metric.decimals);
  const { domain, ticks } = niceAxis(
    data.flatMap((d) => [d.jugador, d.categoria, d.linea]).filter((v): v is number => v !== null && !Number.isNaN(v)),
    metric.decimals,
  );

  return (
    <div>
      <div className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Métrica">
        {metrics.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={m.id === metric.id}
            onClick={() => setSelected(m.id)}
            className={`chip h-8 shrink-0 px-3 text-sm ${
              m.id === metric.id ? "bg-orc-orange text-orc-black ring-2 ring-orc-orange/40" : "bg-orc-chip text-orc-ink ring-1 ring-orc-line"
            }`}
          >
            {m.name}
          </button>
        ))}
      </div>
      <p className="mb-2 text-sm text-orc-muted">
        <strong className="text-orc-ink">
          {metric.name} ({metric.unit}).
        </strong>{" "}
        {METRIC_INFO[metric.code]?.what}{" "}
        {!metric.higherIsBetter && "Eje invertido: menos es mejor, así que arriba siempre es mejor."}
      </p>
      <div className="h-64 w-full">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
            <CartesianGrid stroke="#e7e5e4" vertical={false} />
            <XAxis dataKey="date" tickFormatter={(d: string) => formatDate(d)} fontSize={12} stroke="#57534e" />
            <YAxis
              reversed={!metric.higherIsBetter}
              domain={domain}
              ticks={ticks}
              tickFormatter={fmt}
              fontSize={12}
              width={56}
              stroke="#57534e"
            />
            <Tooltip
              formatter={(v) => (typeof v === "number" ? `${fmt(v)} ${metric.unit}` : String(v))}
              labelFormatter={(d) => formatDate(String(d), { day: "numeric", month: "long", year: "numeric" })}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="jugador" name="Jugador" stroke="#f1882a" strokeWidth={3} dot={{ r: 4 }} isAnimationActive={false} />
            <Line
              type="monotone"
              dataKey="categoria"
              name="Promedio categoría"
              stroke="#231f20"
              strokeDasharray="5 4"
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="linea"
              name="Promedio de su línea"
              stroke="#a8a29e"
              strokeDasharray="2 3"
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Barra de z-score (−2..+2). Positivo = mejor que el promedio, siempre. */
export function ZBar({ z, label }: { z: number | null; label: string }) {
  if (z === null || Number.isNaN(z)) {
    return (
      <div className="text-xs text-orc-muted" title="Se necesitan al menos 3 jugadores medidos para comparar">
        {label}: sin datos suficientes
      </div>
    );
  }
  const clamped = Math.max(-2, Math.min(2, z));
  const pct = ((clamped + 2) / 4) * 100;
  const tone = z >= 0.5 ? "text-good" : z <= -0.5 ? "text-bad" : "text-orc-muted";
  return (
    <div className="text-xs">
      <div className="flex justify-between">
        <span className="text-orc-muted">{label}</span>
        <span className={`font-semibold tabular-nums ${tone}`}>
          {z > 0 ? "+" : ""}
          {z.toLocaleString("es-AR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} DE
        </span>
      </div>
      <div className="relative mt-1 h-1.5 rounded-full bg-gradient-to-r from-track-bad via-track-mid to-track-good">
        <span className="absolute top-1/2 left-1/2 h-3 w-px -translate-y-1/2 bg-orc-muted" aria-hidden />
        <span
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-orc-surface bg-orc-ink shadow"
          style={{ left: `${pct}%` }}
          aria-hidden
        />
      </div>
    </div>
  );
}

/**
 * Eje Y con marcas distintas al redondear a los decimales de la métrica.
 * (Con rangos chicos, p.ej. sprint 1,73–1,76 s, el eje automático repetía
 * "1,74" porque sus marcas caían entre centésimas.)
 */
export function niceAxis(values: number[], decimals: number): { domain: [number, number]; ticks: number[] } {
  if (values.length === 0) return { domain: [0, 1], ticks: [0, 1] };
  const unit = 10 ** -decimals;
  let min = Math.min(...values);
  let max = Math.max(...values);
  const pad = Math.max((max - min) * 0.15, unit);
  min -= pad;
  max += pad;
  // Paso "lindo" (1, 2, 2.5, 5 × 10^k), nunca menor a la resolución de la métrica.
  const raw = (max - min) / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(unit, ([1, 2, 2.5, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag);
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = start; t <= end + step / 2; t += step) ticks.push(Number(t.toFixed(decimals + 2)));
  return { domain: [ticks[0], ticks[ticks.length - 1]], ticks };
}
