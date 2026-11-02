import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, InlineAction } from "@/components/action-form";
import { Collapsible } from "@/components/collapsible";
import { CONSENT_TYPES, loadCatalog, requireAdmin } from "@/lib/admin";
import { formatDate } from "@/lib/labels";
import { ageOn, clubToday } from "@/lib/validation";
import {
  addGuardian,
  registerConsent,
  revokeConsent,
  savePrivate,
  setPlayerActive,
  unlinkGuardian,
  updatePlayer,
} from "../../actions";
import { Field, PlayerFields } from "../player-fields";

export const dynamic = "force-dynamic";

const REL: Record<string, string> = { madre: "Madre", padre: "Padre", tutor_legal: "Tutor legal", otro: "Otro" };

export default async function AdminPlayer({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ nuevo?: string }>;
}) {
  const { id } = await params;
  const { nuevo } = await searchParams;
  const { supabase, season } = await requireAdmin();
  const { categories, positions } = await loadCatalog();

  const [playerRes, pscRes, linksRes, consentsRes, privRes] = await Promise.all([
    supabase
      .from("players")
      .select("id, first_name, last_name, birth_date, sex, dominant_side, primary_position_id, secondary_position_id, active")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("player_season_categories")
      .select("category_id, jersey_number")
      .eq("player_id", id)
      .eq("season_id", season?.id ?? "00000000-0000-0000-0000-000000000000")
      .maybeSingle(),
    supabase
      .from("player_guardians")
      .select("guardian_id, relationship, is_primary, guardian:guardians(id, full_name, phone, email, document_id)")
      .eq("player_id", id),
    supabase
      .from("consents")
      .select("id, consent_type, guardian_id, document_version, granted_at, revoked_at")
      .eq("player_id", id)
      .order("granted_at", { ascending: false }),
    supabase
      .from("player_private")
      .select("document_id, phone, email, address, emergency_contact, medical_notes")
      .eq("player_id", id)
      .maybeSingle(),
  ]);

  const player = playerRes.data;
  if (!player) notFound();
  const psc = pscRes.data;
  type Link_ = {
    guardian_id: string;
    relationship: string;
    is_primary: boolean;
    guardian: { id: string; full_name: string; phone: string | null; email: string | null; document_id: string | null } | null;
  };
  const guardians = ((linksRes.data ?? []) as unknown as Link_[]).filter((l) => l.guardian);
  const guardianName = new Map(guardians.map((g) => [g.guardian_id, g.guardian!.full_name]));
  const consents = consentsRes.data ?? [];
  const active = new Map(consents.filter((c) => !c.revoked_at).map((c) => [c.consent_type as string, c]));
  const history = consents.filter((c) => c.revoked_at);
  const priv = privRes.data;
  const age = ageOn(player.birth_date as string, clubToday());
  const minor = age < 18;
  const pending = CONSENT_TYPES.filter((t) => !active.has(t.code));

  const checks = [
    { ok: Boolean(psc), text: psc ? `En ${categories.find((c) => c.id === psc.category_id)?.name}` : "Sin categoría en la temporada" },
    ...(minor ? [{ ok: guardians.length > 0, text: guardians.length ? `${guardians.length} tutor(es)` : "Falta cargar un tutor (es menor)" }] : []),
    { ok: active.has("performance_data"), text: active.has("performance_data") ? "Consentimiento de rendimiento" : "Falta consentimiento de rendimiento" },
    { ok: active.has("medical_data"), text: active.has("medical_data") ? "Consentimiento de salud" : "Falta consentimiento de salud" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/admin/jugadores" className="text-sm text-orc-muted">
          ← Jugadores
        </Link>
        <Link href={`/jugadores/${id}`} className="text-sm font-semibold text-orc-orange-strong">
          Ver perfil deportivo →
        </Link>
      </div>

      <header className="card space-y-3">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="text-xl font-black">
            {player.first_name} {player.last_name}
          </h2>
          <span className="text-orc-muted">
            {age} años{minor ? " · menor de edad" : ""}
          </span>
          {!player.active && <span className="chip bg-orc-chip text-orc-muted">Dado de baja</span>}
        </div>
        {nuevo && (
          <p className="chip tone-green px-3 py-1 text-sm">Jugador creado. Ahora cargá tutores y consentimientos.</p>
        )}
        <ul className="grid gap-1 sm:grid-cols-2">
          {checks.map((c) => (
            <li key={c.text} className="flex items-center gap-2 text-sm">
              <span className={`grid size-5 place-items-center rounded-full text-xs font-black ${c.ok ? "tone-green" : "tone-red"}`} aria-hidden>
                {c.ok ? "✓" : "!"}
              </span>
              <span className={c.ok ? "" : "font-semibold"}>{c.text}</span>
            </li>
          ))}
        </ul>
      </header>

      {/* Datos del jugador */}
      <section className="card space-y-3">
        <h3 className="font-bold">Datos del jugador</h3>
        <ActionForm action={updatePlayer} submitLabel="Guardar cambios">
          <input type="hidden" name="id" value={id} />
          <PlayerFields
            categories={categories}
            positions={positions}
            seasonName={season?.name ?? ""}
            values={{
              first_name: player.first_name as string,
              last_name: player.last_name as string,
              birth_date: player.birth_date as string,
              sex: player.sex as string,
              dominant_side: player.dominant_side as string | null,
              primary_position_id: player.primary_position_id as number | null,
              secondary_position_id: player.secondary_position_id as number | null,
              category_id: (psc?.category_id as string) ?? null,
              jersey_number: (psc?.jersey_number as number) ?? null,
            }}
          />
        </ActionForm>
      </section>

      {/* Tutores */}
      <section className="card space-y-3">
        <div>
          <h3 className="font-bold">Tutores</h3>
          <p className="text-sm text-orc-muted">
            {minor
              ? "Es menor: los consentimientos los firma un tutor cargado acá."
              : "Es mayor de edad: puede firmar sus propios consentimientos. Los tutores son opcionales."}
          </p>
        </div>
        {guardians.length > 0 && (
          <ul className="divide-y divide-orc-line rounded-lg border border-orc-line">
            {guardians.map((g) => (
              <li key={g.guardian_id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span>
                  <span className="font-semibold">{g.guardian!.full_name}</span>{" "}
                  <span className="text-orc-muted">
                    · {REL[g.relationship]}
                    {g.is_primary ? " · principal" : ""}
                  </span>
                  <span className="block text-orc-muted">
                    {[g.guardian!.phone, g.guardian!.email, g.guardian!.document_id && `DNI ${g.guardian!.document_id}`]
                      .filter(Boolean)
                      .join(" · ") || "Sin datos de contacto"}
                  </span>
                </span>
                <InlineAction
                  action={unlinkGuardian}
                  fields={{ player_id: id, guardian_id: g.guardian_id }}
                  label="Quitar"
                  confirmText={`¿Quitar a ${g.guardian!.full_name} como tutor?`}
                />
              </li>
            ))}
          </ul>
        )}
        <Collapsible
          summary="+ Agregar tutor"
          initiallyOpen={guardians.length === 0 && minor}
          className="rounded-lg border border-dashed border-orc-line-strong p-3"
        >
          <ActionForm action={addGuardian} submitLabel="Agregar tutor" className="mt-3 space-y-3" resetOnSuccess>
            <input type="hidden" name="player_id" value={id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre y apellido" id="g_full_name">
                <input id="g_full_name" name="full_name" required className="field-input" />
              </Field>
              <Field label="Relación" id="g_relationship">
                <select id="g_relationship" name="relationship" required defaultValue="" className="field-input">
                  <option value="" disabled>
                    Elegir…
                  </option>
                  {Object.entries(REL).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Teléfono" id="g_phone">
                <input id="g_phone" name="phone" type="tel" inputMode="tel" className="field-input" />
              </Field>
              <Field label="Email" id="g_email">
                <input id="g_email" name="email" type="email" className="field-input" />
              </Field>
              <Field label="DNI" id="g_document_id">
                <input id="g_document_id" name="document_id" inputMode="numeric" className="field-input" />
              </Field>
              <label className="flex items-center gap-2 self-end pb-3 text-sm">
                <input type="checkbox" name="is_primary" defaultChecked={guardians.length === 0} className="size-5 accent-orc-orange" />
                Contacto principal
              </label>
            </div>
          </ActionForm>
        </Collapsible>
      </section>

      {/* Consentimientos */}
      <section className="card space-y-3">
        <div>
          <h3 className="font-bold">Consentimientos</h3>
          <p className="text-sm text-orc-muted">
            Registrá cada autorización firmada. Rendimiento y salud son obligatorios para cargar testeos, bienestar y lesiones.
          </p>
        </div>
        <ul className="divide-y divide-orc-line rounded-lg border border-orc-line">
          {CONSENT_TYPES.map((t) => {
            const c = active.get(t.code);
            return (
              <li key={t.code} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span>
                  <span className="font-semibold">{t.label}</span>
                  {t.required && <span className="text-orc-muted"> · obligatorio</span>}
                  <span className="block text-orc-muted">
                    {c
                      ? `Vigente desde ${formatDate(c.granted_at as string, { day: "numeric", month: "short", year: "numeric" })} · firmó ${
                          c.guardian_id ? (guardianName.get(c.guardian_id as string) ?? "un tutor") : "el jugador"
                        } · versión ${c.document_version}`
                      : "Sin registrar"}
                  </span>
                </span>
                {c ? (
                  <span className="flex items-center gap-3">
                    <span className="chip tone-green">Vigente</span>
                    <InlineAction
                      action={revokeConsent}
                      fields={{ id: c.id as string, player_id: id }}
                      label="Revocar"
                      confirmText={`¿Revocar el consentimiento de ${t.label.toLowerCase()}? Desde ahora no se podrán cargar esos datos.`}
                    />
                  </span>
                ) : (
                  <span className={`chip ${t.required ? "tone-red" : "bg-orc-chip text-orc-muted"}`}>Falta</span>
                )}
              </li>
            );
          })}
        </ul>

        {pending.length > 0 && (
          <Collapsible
            summary="+ Registrar consentimiento firmado"
            initiallyOpen={!active.has("performance_data")}
            className="rounded-lg border border-dashed border-orc-line-strong p-3"
          >
            {minor && guardians.length === 0 ? (
              <p className="mt-3 text-sm font-semibold text-bad">Primero cargá un tutor: un menor no puede firmar por sí mismo.</p>
            ) : (
              <ActionForm action={registerConsent} submitLabel="Registrar" className="mt-3 space-y-3" resetOnSuccess>
                <input type="hidden" name="player_id" value={id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Tipo" id="c_type">
                    <select id="c_type" name="consent_type" required defaultValue={pending[0]?.code} className="field-input">
                      {pending.map((t) => (
                        <option key={t.code} value={t.code}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Firmado por" id="c_guardian">
                    <select id="c_guardian" name="guardian_id" defaultValue={guardians[0]?.guardian_id ?? ""} className="field-input">
                      {guardians.map((g) => (
                        <option key={g.guardian_id} value={g.guardian_id}>
                          {g.guardian!.full_name} ({REL[g.relationship].toLowerCase()})
                        </option>
                      ))}
                      {!minor && <option value="">El jugador (mayor de edad)</option>}
                    </select>
                  </Field>
                  <Field label="Fecha de firma" id="c_date">
                    <input id="c_date" name="granted_on" type="date" required defaultValue={clubToday()} max={clubToday()} className="field-input" />
                  </Field>
                  <Field label="Versión del documento" id="c_version" help="Para saber qué texto firmó si el formulario cambia.">
                    <input id="c_version" name="document_version" defaultValue={`${season?.name ?? "2026"}-v1`} className="field-input" />
                  </Field>
                </div>
                <Field label="Notas (opcional)" id="c_notes">
                  <input id="c_notes" name="notes" placeholder="Ej.: firmado en papel, archivado en secretaría" className="field-input" />
                </Field>
              </ActionForm>
            )}
          </Collapsible>
        )}

        {history.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-orc-muted">Historial de revocados ({history.length})</summary>
            <ul className="mt-2 space-y-1 text-orc-muted">
              {history.map((h) => (
                <li key={h.id as string}>
                  {CONSENT_TYPES.find((t) => t.code === h.consent_type)?.label}: firmado{" "}
                  {formatDate(h.granted_at as string, { day: "numeric", month: "short", year: "numeric" })}, revocado{" "}
                  {formatDate(h.revoked_at as string, { day: "numeric", month: "short", year: "numeric" })}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* Datos privados */}
      <section className="card space-y-3">
        <div>
          <h3 className="font-bold">Datos privados y de emergencia</h3>
          <p className="text-sm text-orc-muted">Sólo los ven el admin y el área médica. Los profes no tienen acceso.</p>
        </div>
        <ActionForm action={savePrivate} submitLabel="Guardar datos privados">
          <input type="hidden" name="player_id" value={id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="DNI" id="p_doc">
              <input id="p_doc" name="document_id" inputMode="numeric" defaultValue={priv?.document_id ?? ""} className="field-input" />
            </Field>
            <Field label="Teléfono del jugador" id="p_phone">
              <input id="p_phone" name="phone" type="tel" defaultValue={priv?.phone ?? ""} className="field-input" />
            </Field>
            <Field label="Email del jugador" id="p_email">
              <input id="p_email" name="email" type="email" defaultValue={priv?.email ?? ""} className="field-input" />
            </Field>
            <Field label="Contacto de emergencia" id="p_emergency">
              <input
                id="p_emergency"
                name="emergency_contact"
                placeholder="Nombre y teléfono"
                defaultValue={priv?.emergency_contact ?? ""}
                className="field-input"
              />
            </Field>
            <Field label="Domicilio" id="p_address">
              <input id="p_address" name="address" defaultValue={priv?.address ?? ""} className="field-input" />
            </Field>
          </div>
          <Field label="Notas médicas (alergias, medicación, condiciones)" id="p_medical">
            <textarea
              id="p_medical"
              name="medical_notes"
              rows={3}
              defaultValue={priv?.medical_notes ?? ""}
              className="field-input h-auto py-2 text-base"
            />
          </Field>
        </ActionForm>
      </section>

      {/* Baja */}
      <section className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold">{player.active ? "Dar de baja" : "Reactivar jugador"}</h3>
          <p className="text-sm text-orc-muted">
            {player.active
              ? "Deja de aparecer en planteles y en la carga. Su historial se conserva."
              : "Vuelve a aparecer en los planteles de su categoría."}
          </p>
        </div>
        <InlineAction
          action={setPlayerActive}
          fields={{ id, active: player.active ? "false" : "true" }}
          label={player.active ? "Dar de baja" : "Reactivar"}
          className={player.active ? "btn-ghost text-bad" : "btn-primary"}
          confirmText={player.active ? "¿Dar de baja al jugador? Su historial se conserva." : undefined}
        />
      </section>
    </div>
  );
}
