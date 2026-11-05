"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fieldModules, hasConsent } from "@/lib/offline/field-data";
import { canEdit } from "@/lib/modules";
import { discardOutbox, enqueue } from "@/lib/offline/outbox";
import { randomId } from "@/lib/offline/ids";
import { validateInjury, type InjuryDraft } from "@/lib/injury";
import { bodyRegionLabel, injuryContextLabel, injuryMechanismLabel, injuryTypeLabel, sideLabel } from "@/lib/labels";
import { clubToday } from "@/lib/validation";
import { Field } from "@/app/(app)/admin/jugadores/player-fields";
import { useFieldData } from "./use-field-data";
import { useSync } from "./sync-provider";
import { PendingInjuries } from "./pending-injuries";

const STAFF = ["admin", "coach", "medical"];

const emptyDraft = (player_id: string, today: string): InjuryDraft => ({
  player_id,
  occurred_on: today,
  context: "training",
  body_region: "",
  injury_type: "",
  side: null,
  mechanism: "unknown",
  is_recurrence: false,
  expected_return: null,
  summary: null,
});

/**
 * Registro de lesión que funciona sin señal: se guarda en el celular (outbox)
 * con un id generado acá, y se sube solo cuando hay conexión. El reenvío es
 * idempotente (mismo id), así que no se duplica aunque se corte a mitad.
 */
export function InjuryForm() {
  const { data, loading } = useFieldData();
  const { items, online } = useSync();
  const params = useSearchParams();
  const today = clubToday();
  const [draft, setDraft] = useState<InjuryDraft>(() => emptyDraft(params.get("jugador") ?? "", today));
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [seen, setSeen] = useState(false);

  const withConsent = useMemo(
    () => new Set((data?.roster ?? []).filter((p) => hasConsent(data!.consents, p.id, "medical_data")).map((p) => p.id)),
    [data],
  );

  const savedKey = savedId ? `injuries:${savedId}` : undefined;
  const savedItem = savedKey ? items.find((i) => i.key === savedKey) : undefined;
  useEffect(() => {
    if (savedItem) setSeen(true);
  }, [savedItem]);

  if (!data) {
    return (
      <p className="card text-sm text-orc-muted">
        {loading ? "Cargando planteles…" : "Abrí esta página una vez con señal para poder registrar lesiones sin conexión."}
      </p>
    );
  }
  if (!STAFF.includes(data.profile.role) || !canEdit(fieldModules(data), "injuries")) {
    return <p className="card">No tenés permiso para registrar lesiones.</p>;
  }

  const set = <K extends keyof InjuryDraft>(k: K, v: InjuryDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const playerName = (id: string) => {
    const p = data.roster.find((r) => r.id === id);
    return p ? `${p.first_name} ${p.last_name}` : "";
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const clean: InjuryDraft = { ...draft, summary: draft.summary?.trim() || null };
    const problem = validateInjury(clean, clubToday(), withConsent);
    if (problem) {
      setError(problem);
      return;
    }
    const id = randomId();
    await enqueue("injuries", { id, ...clean, status: "active" });
    setError(null);
    setSeen(false);
    setSavedId(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function another() {
    setSavedId(null);
    setSeen(false);
    setDraft(emptyDraft("", clubToday()));
  }

  if (savedId) {
    const synced = seen && !savedItem;
    return (
      <div className="space-y-4">
        <section className="card space-y-3" role="status">
          {synced ? (
            <>
              <h1 className="text-xl font-black">Lesión registrada</h1>
              <p className="text-sm">
                {playerName(draft.player_id)}: ya está subida y el área médica la ve en su lista.
              </p>
            </>
          ) : savedItem?.status === "error" ? (
            <>
              <h1 className="text-xl font-black">No se pudo subir</h1>
              <p className="rounded-lg tone-red px-3 py-2 text-sm">{savedItem.error}</p>
            </>
          ) : (
            <>
              <h1 className="text-xl font-black">Guardada en el celular</h1>
              <p className="text-sm">
                {online
                  ? "Subiendo…"
                  : "No hay señal. La lesión quedó guardada en este celular y se sube sola cuando vuelva la conexión. No cierres sesión hasta que se suba."}
              </p>
            </>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" onClick={another}>
              Registrar otra
            </button>
            {synced && (
              <Link href={`/lesiones/${savedId}`} className="btn-ghost">
                Ver la lesión
              </Link>
            )}
            {savedItem?.status === "error" && (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  void discardOutbox(savedItem.key);
                  another();
                }}
              >
                Descartar
              </button>
            )}
          </div>
        </section>
        <PendingInjuries excludeKey={savedKey} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="card space-y-4">
        <div>
          <h1 className="text-xl font-black">Registrar lesión</h1>
          <p className="text-sm text-orc-muted">
            Cargá lo que viste en la cancha. El diagnóstico y el seguimiento los completa el área médica.
            {!online && " Sin señal: se guarda en el celular y se sube sola después."}
          </p>
        </div>
        <form onSubmit={(e) => void save(e)} className="space-y-3" noValidate>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Jugador" id="player_id" help="Los que no tienen el consentimiento de salud firmado aparecen deshabilitados.">
              <select id="player_id" value={draft.player_id} onChange={(e) => set("player_id", e.target.value)} className="field-input">
                <option value="" disabled>
                  Elegir…
                </option>
                {data.categories.map((c) => {
                  const players = data.roster
                    .filter((r) => r.category_id === c.id)
                    .sort((a, b) => a.last_name.localeCompare(b.last_name));
                  if (players.length === 0) return null;
                  return (
                    <optgroup key={c.id} label={c.name}>
                      {players.map((p) => (
                        <option key={p.id} value={p.id} disabled={!withConsent.has(p.id)}>
                          {p.last_name}, {p.first_name}
                          {withConsent.has(p.id) ? "" : " — sin consentimiento de salud"}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </Field>
            <Field label="Fecha" id="occurred_on">
              <input
                id="occurred_on"
                type="date"
                value={draft.occurred_on}
                max={today}
                onChange={(e) => set("occurred_on", e.target.value)}
                className="field-input"
              />
            </Field>
            <Field label="¿Dónde pasó?" id="context">
              <select id="context" value={draft.context} onChange={(e) => set("context", e.target.value)} className="field-input">
                {Object.entries(injuryContextLabel).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Zona del cuerpo" id="body_region">
              <select id="body_region" value={draft.body_region} onChange={(e) => set("body_region", e.target.value)} className="field-input">
                <option value="" disabled>
                  Elegir…
                </option>
                {Object.entries(bodyRegionLabel).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tipo" id="injury_type" help="Si no estás seguro, elegí «Otra»: lo corrige el área médica.">
              <select id="injury_type" value={draft.injury_type} onChange={(e) => set("injury_type", e.target.value)} className="field-input">
                <option value="" disabled>
                  Elegir…
                </option>
                {Object.entries(injuryTypeLabel).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Lado" id="side">
              <select id="side" value={draft.side ?? ""} onChange={(e) => set("side", e.target.value || null)} className="field-input">
                <option value="">No aplica</option>
                {Object.entries(sideLabel).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="¿Cómo fue?" id="mechanism">
              <select id="mechanism" value={draft.mechanism} onChange={(e) => set("mechanism", e.target.value)} className="field-input">
                {Object.entries(injuryMechanismLabel).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Regreso estimado (opcional)" id="expected_return">
              <input
                id="expected_return"
                type="date"
                min={draft.occurred_on || today}
                value={draft.expected_return ?? ""}
                onChange={(e) => set("expected_return", e.target.value || null)}
                className="field-input"
              />
            </Field>
          </div>
          <Field label="Qué pasó (breve, sin datos clínicos)" id="summary">
            <input
              id="summary"
              maxLength={200}
              value={draft.summary ?? ""}
              onChange={(e) => set("summary", e.target.value)}
              placeholder="Ej.: se resintió el isquio derecho en un sprint"
              className="field-input"
            />
          </Field>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={draft.is_recurrence}
              onChange={(e) => set("is_recurrence", e.target.checked)}
              className="size-5 accent-orc-orange"
            />
            Es una recidiva (ya se había lesionado ahí)
          </label>
          <p className="rounded-lg tone-amber px-3 py-2 text-sm">
            <b>Si es un golpe en la cabeza:</b> elegí tipo «Conmoción». El jugador no vuelve a jugar ese día y sigue el
            protocolo de regreso gradual con alta médica.
          </p>
          {error && (
            <p role="alert" className="rounded-lg tone-red px-3 py-2 text-sm font-semibold">
              {error}
            </p>
          )}
          <button type="submit" className="btn-primary w-full sm:w-auto">
            Registrar lesión
          </button>
        </form>
      </section>
      <PendingInjuries />
    </div>
  );
}
