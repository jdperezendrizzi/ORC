import { ActionForm, InlineAction } from "@/components/action-form";
import { grantPortalAccess, revokePortalAccess } from "./access-actions";

export interface AccessRow {
  kind: "player" | "guardian";
  label: string;
  name: string;
  guardianId?: string;
  linked: { profileId: string; email: string; active: boolean } | null;
  suggestedEmail: string;
}

/** Acceso de solo lectura al portal «Mi jugador» (jugador y tutores). */
export function PortalAccess({
  playerId,
  rows,
  minor,
  familyConsent,
}: {
  playerId: string;
  rows: AccessRow[];
  minor: boolean;
  familyConsent: boolean;
}) {
  return (
    <section className="card space-y-3" aria-label="Acceso al portal">
      <div>
        <h3 className="font-bold">Acceso «Mi jugador» (jugador y familia)</h3>
        <p className="text-sm text-orc-muted">
          Solo lectura: categoría, asistencia, objetivos y marcas físicas propias. No ven lesiones, bienestar, datos privados,
          evaluación de pase ni a otros jugadores.
        </p>
      </div>
      {!familyConsent && (
        <p className="rounded-lg tone-amber px-3 py-2 text-sm">
          {minor
            ? "Falta el consentimiento «Acceso de la familia»: aunque tengan cuenta, no van a ver nada hasta que se registre (abajo, en Consentimientos)."
            : "Los tutores necesitan el consentimiento «Acceso de la familia» para ver sus datos. El jugador (mayor de edad) ve lo suyo igual."}
        </p>
      )}
      <ul className="divide-y divide-orc-line rounded-lg border border-orc-line">
        {rows.map((r) => (
          <li key={`${r.kind}-${r.guardianId ?? "p"}`} className="space-y-2 px-3 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <span className="font-semibold">{r.name}</span> <span className="text-sm text-orc-muted">· {r.label}</span>
              </span>
              {r.linked ? (
                <span className={`chip text-xs ${r.linked.active ? "tone-green" : "tone-amber"}`}>
                  {r.linked.active ? `Con acceso: ${r.linked.email}` : `Cuenta inactiva: ${r.linked.email}`}
                </span>
              ) : (
                <span className="chip text-xs">Sin acceso</span>
              )}
            </div>
            {r.linked ? (
              <InlineAction
                action={revokePortalAccess}
                fields={{ kind: r.kind, player_id: playerId, guardian_id: r.guardianId ?? "", profile_id: r.linked.profileId }}
                label="Quitar acceso"
                confirmText={`¿Quitarle el acceso a ${r.name}?`}
              />
            ) : (
              <ActionForm action={grantPortalAccess} submitLabel="Dar acceso" submitClassName="btn-ghost h-10" className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="kind" value={r.kind} />
                <input type="hidden" name="player_id" value={playerId} />
                <input type="hidden" name="guardian_id" value={r.guardianId ?? ""} />
                <input type="hidden" name="full_name" value={r.name} />
                <label className="block min-w-0 flex-1">
                  <span className="label">Email</span>
                  <input name="email" type="email" required defaultValue={r.suggestedEmail} aria-label={`Email de ${r.name}`} className="field-input h-10" />
                </label>
              </ActionForm>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-orc-muted">
        Si la cuenta no existe, se envía una invitación por email (requiere la clave de servicio en Vercel); si ya existe, se vincula.
      </p>
    </section>
  );
}
