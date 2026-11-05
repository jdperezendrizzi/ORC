import { ROLE_OPTIONS } from "@/lib/admin";
import type { Category } from "@/lib/types";
import { Field } from "../jugadores/player-fields";

/** Rol y categorías a cargo (alta por invitación y edición). */
export function RoleAndCategories({
  idPrefix,
  categories,
  role,
  selected,
  seasonName,
}: {
  idPrefix: string;
  categories: Category[];
  role: string;
  selected: Set<string>;
  seasonName?: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_1fr]">
      <Field label="Rol" id={`${idPrefix}-role`}>
        <select id={`${idPrefix}-role`} name="role" defaultValue={role} className="field-input">
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </Field>
      <fieldset>
        <legend className="label">Categorías a cargo ({seasonName ?? "temporada actual"}) · sólo para profes</legend>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <label key={c.id} className="opt flex cursor-pointer items-center gap-2 px-3 py-2 text-sm has-[:checked]:border-orc-orange has-[:checked]:bg-orc-orange-soft">
              <input type="checkbox" name="category_ids" value={c.id} defaultChecked={selected.has(c.id)} className="size-4 accent-orc-orange" />
              {c.name}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="text-xs text-orc-muted sm:col-span-2">
        {ROLE_OPTIONS.map((r) => (
          <span key={r.value} className="mr-3 inline-block">
            <b>{r.label}:</b> {r.help}
          </span>
        ))}
      </p>
    </div>
  );
}
