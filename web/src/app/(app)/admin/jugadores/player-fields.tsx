import type { Category, Position } from "@/lib/types";

export interface PlayerFormValues {
  first_name?: string;
  last_name?: string;
  birth_date?: string;
  sex?: string;
  dominant_side?: string | null;
  primary_position_id?: number | null;
  secondary_position_id?: number | null;
  category_id?: string | null;
  jersey_number?: number | null;
}

/** Campos del jugador (alta y edición). */
export function PlayerFields({
  values = {},
  categories,
  positions,
  seasonName,
}: {
  values?: PlayerFormValues;
  categories: Category[];
  positions: Position[];
  seasonName: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Nombre" id="first_name">
        <input id="first_name" name="first_name" required defaultValue={values.first_name} autoComplete="off" className="field-input" />
      </Field>
      <Field label="Apellido" id="last_name">
        <input id="last_name" name="last_name" required defaultValue={values.last_name} autoComplete="off" className="field-input" />
      </Field>
      <Field label="Fecha de nacimiento" id="birth_date">
        <input id="birth_date" name="birth_date" type="date" required defaultValue={values.birth_date} className="field-input" />
      </Field>
      <Field label="Sexo" id="sex">
        <select id="sex" name="sex" required defaultValue={values.sex ?? ""} className="field-input">
          <option value="" disabled>
            Elegir…
          </option>
          <option value="male">Masculino</option>
          <option value="female">Femenino</option>
        </select>
      </Field>
      <Field label={`Categoría ${seasonName}`} id="category_id" help="Define qué profes ven al jugador.">
        <select id="category_id" name="category_id" defaultValue={values.category_id ?? ""} className="field-input">
          <option value="">Sin categoría</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Número de camiseta" id="jersey_number">
        <input
          id="jersey_number"
          name="jersey_number"
          type="number"
          min={1}
          max={99}
          inputMode="numeric"
          defaultValue={values.jersey_number ?? ""}
          className="field-input"
        />
      </Field>
      <Field label="Puesto principal" id="primary_position_id">
        <select id="primary_position_id" name="primary_position_id" defaultValue={values.primary_position_id ?? ""} className="field-input">
          <option value="">Sin definir</option>
          {positions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.id}. {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Puesto secundario" id="secondary_position_id">
        <select id="secondary_position_id" name="secondary_position_id" defaultValue={values.secondary_position_id ?? ""} className="field-input">
          <option value="">Ninguno</option>
          {positions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.id}. {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Perfil dominante" id="dominant_side">
        <select id="dominant_side" name="dominant_side" defaultValue={values.dominant_side ?? ""} className="field-input">
          <option value="">Sin definir</option>
          <option value="right">Derecho</option>
          <option value="left">Zurdo</option>
          <option value="both">Ambidiestro</option>
        </select>
      </Field>
    </div>
  );
}

export function Field({ label, id, help, children }: { label: string; id: string; help?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {children}
      {help && <p className="mt-1 text-xs text-orc-muted">{help}</p>}
    </div>
  );
}
