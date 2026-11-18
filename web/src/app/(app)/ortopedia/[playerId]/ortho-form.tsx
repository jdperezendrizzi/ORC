"use client";

import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { bmiOf, campaignLabel, ORTHO_SECTIONS, OUTCOMES, REGION_STATUS, type OrthoField } from "@/lib/ortho";
import { saveOrthoEvaluation } from "../actions";

type Values = Record<string, unknown>;

const asText = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/** Ficha traumatológica de una campaña, en el mismo orden que la ficha en papel. */
export function OrthoForm({ playerId, campaign, initial, today }: { playerId: string; campaign: number; initial: Values | null; today: string }) {
  const [weight, setWeight] = useState(asText(initial?.weight_kg));
  const [height, setHeight] = useState(asText(initial?.height_cm));
  const bmi = bmiOf(Number(weight.replace(",", ".")) || null, Number(height.replace(",", ".")) || null);

  const input = (f: OrthoField) => {
    const id = `o-${f.key}`;
    const v = initial?.[f.key];
    switch (f.kind) {
      case "date":
        return <input id={id} name={f.key} type="date" max={today} defaultValue={asText(v) || today} className="field-input" />;
      case "number":
        return (
          <div className="flex items-center gap-2">
            <input
              id={id}
              name={f.key}
              inputMode="decimal"
              defaultValue={f.key === "weight_kg" || f.key === "height_cm" ? undefined : asText(v)}
              value={f.key === "weight_kg" ? weight : f.key === "height_cm" ? height : undefined}
              onChange={f.key === "weight_kg" ? (e) => setWeight(e.target.value) : f.key === "height_cm" ? (e) => setHeight(e.target.value) : undefined}
              className="field-input w-28"
            />
            <span className="text-sm text-orc-muted">{f.unit}</span>
          </div>
        );
      case "long":
        return <textarea id={id} name={f.key} rows={2} defaultValue={asText(v)} className="field-input min-h-0 py-2" />;
      case "bool":
        return (
          <div className="flex gap-2" role="radiogroup" aria-labelledby={`${id}-l`}>
            {[
              ["yes", "Sí", v === true],
              ["no", "No", v === false],
              ["", "Sin dato", v === null || v === undefined],
            ].map(([val, label, checked]) => (
              <label key={String(val)} className="chip cursor-pointer gap-1 px-3 py-1.5 has-[:checked]:bg-orc-orange has-[:checked]:text-black">
                <input type="radio" name={f.key} value={String(val)} defaultChecked={Boolean(checked)} className="sr-only" />
                {label}
              </label>
            ))}
          </div>
        );
      case "status":
        return (
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={`${id}-l`}>
            {REGION_STATUS.map((s) => (
              <label key={s.value} className="chip cursor-pointer gap-1 px-3 py-1.5 has-[:checked]:ring-2 has-[:checked]:ring-orc-orange has-[:checked]:font-bold">
                <input type="radio" name={f.key} value={s.value} defaultChecked={v === s.value} className="sr-only" />
                {s.icon} {s.label}
              </label>
            ))}
            <label className="chip cursor-pointer px-3 py-1.5 text-orc-muted has-[:checked]:ring-2 has-[:checked]:ring-orc-orange">
              <input type="radio" name={f.key} value="" defaultChecked={!v} className="sr-only" />
              Sin evaluar
            </label>
          </div>
        );
      case "outcome":
        return (
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-labelledby={`${id}-l`}>
            {OUTCOMES.map((o) => (
              <label key={o.value} className="card cursor-pointer space-y-1 py-3 has-[:checked]:ring-2 has-[:checked]:ring-orc-orange">
                <input type="radio" name={f.key} value={o.value} defaultChecked={v === o.value} className="sr-only" />
                <span className="block font-bold">
                  {o.icon} {o.label}
                </span>
                <span className="block text-xs text-orc-muted">{o.help}</span>
              </label>
            ))}
          </div>
        );
      default:
        return <input id={id} name={f.key} defaultValue={asText(v)} className="field-input" />;
    }
  };

  return (
    <ActionForm action={saveOrthoEvaluation} submitLabel={initial ? `Guardar cambios ${campaignLabel(campaign)}` : `Guardar evaluación ${campaignLabel(campaign)}`}>
      <input type="hidden" name="player_id" value={playerId} />
      <input type="hidden" name="campaign" value={campaign} />
      {ORTHO_SECTIONS.map((s) => (
        <fieldset key={s.id} className="card space-y-3">
          <legend className="sr-only">{s.title}</legend>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-lg font-black">{s.title}</h3>
            {s.by && <span className="text-xs text-orc-muted">{s.by}</span>}
          </div>
          <div className={s.id === "datos" ? "grid gap-3 sm:grid-cols-2" : "space-y-3"}>
            {s.fields.map((f) => (
              <div key={f.key} className="space-y-1">
                <label id={`o-${f.key}-l`} htmlFor={`o-${f.key}`} className="block text-sm font-semibold">
                  {f.label}
                </label>
                {input(f)}
                {f.hint && <p className="text-xs text-orc-muted">{f.hint}</p>}
              </div>
            ))}
            {s.id === "datos" && (
              <div className="space-y-1">
                <span className="block text-sm font-semibold">IMC</span>
                <p className="flex h-11 items-center text-lg font-black" aria-live="polite">
                  {bmi ?? "—"}
                  <span className="ml-2 text-xs font-normal text-orc-muted">se calcula solo</span>
                </p>
              </div>
            )}
          </div>
        </fieldset>
      ))}
    </ActionForm>
  );
}
