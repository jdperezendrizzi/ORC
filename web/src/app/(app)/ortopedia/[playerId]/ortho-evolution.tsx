"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface OrthoPoint {
  campaign: string;
  weight_kg: number | null;
  height_cm: number | null;
  bmi: number | null;
  sit_reach_cm: number | null;
}

const METRICS = [
  { key: "height_cm", label: "Altura", unit: "cm" },
  { key: "weight_kg", label: "Peso", unit: "kg" },
  { key: "bmi", label: "IMC", unit: "" },
  { key: "sit_reach_cm", label: "Sit and reach", unit: "cm" },
] as const;

/** Evolución de las medidas de la ficha, campaña por campaña. */
export function OrthoEvolutionChart({ points }: { points: OrthoPoint[] }) {
  const available = METRICS.filter((m) => points.filter((p) => p[m.key] !== null).length >= 2);
  const [sel, setSel] = useState<string>(available[0]?.key ?? "");
  const metric = available.find((m) => m.key === sel) ?? available[0];
  if (!metric) return null;
  const data = points.map((p) => ({ campaign: p.campaign, value: p[metric.key] }));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Medida">
        {available.map((m) => (
          <button
            key={m.key}
            type="button"
            role="tab"
            aria-selected={m.key === metric.key}
            onClick={() => setSel(m.key)}
            className={`chip px-3 py-1.5 ${m.key === metric.key ? "bg-orc-orange text-black" : ""}`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 16, bottom: 0, left: -8 }}>
            <CartesianGrid stroke="var(--color-orc-line)" strokeDasharray="3 3" />
            <XAxis dataKey="campaign" tick={{ fontSize: 12, fill: "var(--color-orc-muted)" }} />
            <YAxis domain={["auto", "auto"]} tick={{ fontSize: 12, fill: "var(--color-orc-muted)" }} width={44} />
            <Tooltip formatter={(v) => [`${v} ${metric.unit}`.trim(), metric.label]} />
            <Line type="monotone" dataKey="value" stroke="var(--color-orc-orange)" strokeWidth={3} dot={{ r: 5 }} connectNulls isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
