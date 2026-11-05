import { ActionForm, InlineAction } from "@/components/action-form";
import { Collapsible } from "@/components/collapsible";
import { MODULES, levelLabel, roleMax, type AppModule, type ModuleLevel, type Modules } from "@/lib/modules";
import type { AppRole } from "@/lib/types";
import { copyModulePermissions, resetModulePermissions, saveModulePermissions } from "./permissions-actions";

const LEVELS: ModuleLevel[] = ["none", "view", "edit"];
const ORDER = { none: 0, view: 1, edit: 2 } as const;

/** Grilla de permisos por módulo de un usuario (sólo se puede restringir por debajo del rol). */
export function ModulePermissions({
  profileId,
  role,
  effective,
  restricted,
  others,
  initiallyOpen = false,
}: {
  profileId: string;
  role: AppRole;
  effective: Modules;
  restricted: number;
  others: { id: string; name: string }[];
  initiallyOpen?: boolean;
}) {
  if (role === "admin") return <p className="text-xs text-orc-muted">El admin tiene todos los módulos.</p>;
  return (
    <Collapsible summary={`Permisos por módulo${restricted ? ` (${restricted} restringidos)` : " (los de su rol)"}`} className="text-sm" initiallyOpen={initiallyOpen}>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-orc-muted">
          El rol define el máximo; acá se puede restringir. Se combina con las categorías: lo que tenga habilitado lo ve o lo
          carga sólo en sus categorías. Las notas clínicas, la decisión de pase y Admin no cambian.
        </p>
        <ActionForm action={saveModulePermissions} submitLabel="Guardar permisos" submitClassName="btn-ghost h-10">
          <input type="hidden" name="profile_id" value={profileId} />
          <div className="divide-y divide-orc-line rounded-lg border border-orc-line">
            {MODULES.map((m) => {
              const max = roleMax(role, m.id as AppModule);
              return (
                <fieldset key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
                  <legend className="sr-only">{m.label}</legend>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{m.label}</span>
                    <span className="block text-xs text-orc-muted">{m.help}</span>
                  </span>
                  <span className="inline-flex rounded-lg border border-orc-line-strong p-0.5">
                    {LEVELS.map((l) => {
                      const disabled = ORDER[l] > ORDER[max];
                      return (
                        <label
                          key={l}
                          className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-semibold has-[:checked]:bg-orc-orange has-[:checked]:text-orc-black ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
                          title={disabled ? "Su rol no lo permite" : undefined}
                        >
                          <input
                            type="radio"
                            name={`m_${m.id}`}
                            value={l}
                            defaultChecked={effective[m.id as AppModule] === l}
                            disabled={disabled}
                            className="sr-only"
                            aria-label={`${m.label}: ${levelLabel[l]}`}
                          />
                          {levelLabel[l]}
                        </label>
                      );
                    })}
                  </span>
                </fieldset>
              );
            })}
          </div>
        </ActionForm>
        <div className="flex flex-wrap items-end gap-3">
          {restricted > 0 && (
            <InlineAction action={resetModulePermissions} fields={{ profile_id: profileId }} label="Volver a los permisos del rol" />
          )}
          {others.length > 0 && (
            <ActionForm action={copyModulePermissions} submitLabel="Copiar" submitClassName="btn-ghost h-10" className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="profile_id" value={profileId} />
              <label className="block">
                <span className="label">Copiar permisos de</span>
                <select name="from_profile" defaultValue="" className="field-input h-10 text-sm">
                  <option value="" disabled>
                    Elegir…
                  </option>
                  {others.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
            </ActionForm>
          )}
        </div>
      </div>
    </Collapsible>
  );
}
