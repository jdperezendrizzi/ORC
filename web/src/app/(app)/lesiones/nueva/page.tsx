import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { getViewer, getViewerCategories, isStaff } from "@/lib/server-data";
import { bodyRegionLabel, injuryContextLabel, injuryMechanismLabel, injuryTypeLabel, sideLabel } from "@/lib/labels";
import { clubToday } from "@/lib/validation";
import { Field } from "../../admin/jugadores/player-fields";
import { createInjury } from "../actions";

export const metadata: Metadata = { title: "Registrar lesión" };
export const dynamic = "force-dynamic";

export default async function NewInjury({ searchParams }: { searchParams: Promise<{ jugador?: string }> }) {
  const { jugador = "" } = await searchParams;
  const { supabase, season, profile } = await getViewer();
  if (!isStaff(profile) || !season) return <p className="card">No tenés permiso para registrar lesiones.</p>;
  const categories = await getViewerCategories();

  const [rosterRes, consentsRes] = await Promise.all([
    supabase
      .from("player_season_categories")
      .select("category_id, player:players!inner(id, first_name, last_name, active)")
      .eq("season_id", season.id)
      .in("category_id", categories.map((c) => c.id)),
    supabase.from("consents").select("player_id").eq("consent_type", "medical_data").is("revoked_at", null),
  ]);
  type R = { category_id: string; player: { id: string; first_name: string; last_name: string; active: boolean } };
  const roster = ((rosterRes.data ?? []) as unknown as R[]).filter((r) => r.player.active);
  const withConsent = new Set((consentsRes.data ?? []).map((c) => c.player_id as string));
  const today = clubToday();

  return (
    <div className="space-y-4">
      <Link href="/lesiones" className="text-sm text-orc-muted">
        ← Lesiones
      </Link>
      <section className="card space-y-4">
        <div>
          <h1 className="text-xl font-black">Registrar lesión</h1>
          <p className="text-sm text-orc-muted">
            Cargá lo que viste en la cancha. El diagnóstico y el seguimiento los completa el área médica.
          </p>
        </div>
        <ActionForm action={createInjury} submitLabel="Registrar lesión">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Jugador" id="player_id" help="Los que no tienen el consentimiento de salud firmado aparecen deshabilitados.">
              <select id="player_id" name="player_id" required defaultValue={jugador} className="field-input">
                <option value="" disabled>
                  Elegir…
                </option>
                {categories.map((c) => {
                  const players = roster
                    .filter((r) => r.category_id === c.id)
                    .sort((a, b) => a.player.last_name.localeCompare(b.player.last_name));
                  if (players.length === 0) return null;
                  return (
                    <optgroup key={c.id} label={c.name}>
                      {players.map(({ player: p }) => (
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
              <input id="occurred_on" name="occurred_on" type="date" required defaultValue={today} max={today} className="field-input" />
            </Field>
            <Field label="¿Dónde pasó?" id="context">
              <select id="context" name="context" defaultValue="training" className="field-input">
                {Object.entries(injuryContextLabel).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Zona del cuerpo" id="body_region">
              <select id="body_region" name="body_region" required defaultValue="" className="field-input">
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
              <select id="injury_type" name="injury_type" required defaultValue="" className="field-input">
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
              <select id="side" name="side" defaultValue="" className="field-input">
                <option value="">No aplica</option>
                {Object.entries(sideLabel).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="¿Cómo fue?" id="mechanism">
              <select id="mechanism" name="mechanism" defaultValue="unknown" className="field-input">
                {Object.entries(injuryMechanismLabel).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Regreso estimado (opcional)" id="expected_return">
              <input id="expected_return" name="expected_return" type="date" min={today} className="field-input" />
            </Field>
          </div>
          <Field label="Qué pasó (breve, sin datos clínicos)" id="summary">
            <input id="summary" name="summary" maxLength={200} placeholder="Ej.: se resintió el isquio derecho en un sprint" className="field-input" />
          </Field>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="is_recurrence" className="size-5 accent-orc-orange" />
            Es una recidiva (ya se había lesionado ahí)
          </label>
          <p className="rounded-lg tone-amber px-3 py-2 text-sm">
            <b>Si es un golpe en la cabeza:</b> elegí tipo «Conmoción». El jugador no vuelve a jugar ese día y sigue el
            protocolo de regreso gradual con alta médica.
          </p>
        </ActionForm>
      </section>
    </div>
  );
}
