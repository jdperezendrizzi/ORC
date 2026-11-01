"use client";

import { useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ComparisonPoint } from "@/lib/types";
import { formatDate } from "@/lib/labels";
import { formatValue } from "@/lib/validation";

export interface MetricSeries {
  id: string;
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
              m.id === metric.id ? "bg-orc-black text-orc-orange" : "bg-orc-bg text-orc-ink"
            }`}
          >
            {m.name}
          </button>
        ))}
      </div>
      <p className="mb-2 text-xs text-orc-muted">
        {metric.name} ({metric.unit}).{" "}
        {!metric.higherIsBetter && "Eje invertido: menos es mejor, así que arriba siempre es mejor."}
      </p>
      <div className="h-64 w-full">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
            <CartesianGrid stroke="#e7e5e4" vertical={false} />
            <XAxis dataKey="date" tickFormatter={(d: string) => formatDate(d)} fontSize={12} stroke="#57534e" />
            <YAxis
              reversed={!metric.higherIsBetter}
              domain={["auto", "auto"]}
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
            <Line type="monotone" dataKey="jugador" name="Jugador" stroke="#ff7f00" strokeWidth={3} dot={{ r: 4 }} isAnimationActive={false} />
            <Line
              type="monotone"
              dataKey="categoria"
              name="Promedio categoría"
              stroke="#0a0a0a"
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
      <div className="relative mt-1 h-1.5 rounded-full bg-gradient-to-r from-red-200 via-stone-200 to-green-200">
        <span className="absolute top-1/2 left-1/2 h-3 w-px -translate-y-1/2 bg-stone-500" aria-hidden />
        <span
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-orc-black shadow"
          style={{ left: `${pct}%` }}
          aria-hidden
        />
      </div>
    </div>
  );
}
