import type { Metadata } from "next";
import { ActionForm, InlineAction } from "@/components/action-form";
import { Collapsible } from "@/components/collapsible";
import { loadCatalog, requireAdmin } from "@/lib/admin";
import { AREA_ORDER, objectiveAreaLabel } from "@/lib/objectives";
import type { Objective } from "@/lib/types";
import { Field } from "../jugadores/player-fields";
import { copyObjectives, createObjective, setObjectiveActive, updateObjective } from "./actions";

export const metadata: Metadata = { title: "Objetivos" };
export const dynamic = "force-dynamic";

type Row = Objective & { active: boolean };

export default async function AdminObjectives({ searchParams }: { searchParams: Promise<{ categoria?: string }> }) {
  const { supabase, season } = await requireAdmin();
  const { categories } = await loadCatalog();
  const { data: all } = await supabase
    .from("objectives")
    .select("id, category_id, scope, area, title, look_for, exercise_name, exercise_description, exercise_url, sort_order, active")
    .order("sort_order");
  const objectives = (all ?? []) as Row[];
  const count = (cid: string) => objectives.filter((o) => o.category_id === cid && o.active).length;

  const { categoria } = await searchParams;
  const category = categories.find((c) => c.id === categoria) ?? categories.find((c) => count(c.id) > 0) ?? categories[0];
  if (!category) return <p className="card">No hay categorías.</p>;
  const list = objectives.filter((o) => o.category_id === category.id);

  // Avance de la temporada (según la última marca de cada objetivo)
  const { data: checks } = season
    ? await supabase
        .from("objective_checks")
        .select("objective_id, check_date, achieved")
        .eq("season_id", season.id)
        .in("objective_id", list.map((o) => o.id).length ? list.map((o) => o.id) : ["00000000-0000-0000-0000-000000000000"])
    : { data: [] };
  const last = new Map<string, { date: string; achieved: boolean }>();
  for (const c of checks ?? []) {
    const prev = last.get(c.objective_id as string);
    if (!prev || (c.check_date as string) > prev.date) last.set(c.objective_id as string, { date: c.check_date as string, achieved: !!c.achieved });
  }

  return (
    <div className="space-y-5">
      <section className="card space-y-3">
        <div>
          <h2 className="text-lg font-bold">Objetivos por categoría</h2>
          <p className="text-sm text-orc-muted">
            Lo que el equipo tiene que lograr en la temporada. Los profes los ven en <b>Asistencia → Objetivos</b> y los tachan después de cada
            práctica (también sin señal). Cada objetivo puede llevar qué mirar y un ejercicio para trabajarlo.
          </p>
        </div>
        <form className="flex flex-wrap items-end gap-2" method="get">
          <label className="block">
            <span className="label">Categoría</span>
            <select name="categoria" defaultValue={category.id} className="field-input">
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({count(c.id)})
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn-ghost h-11">
            Ver
          </button>
        </form>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-orc-muted">
          {category.name} · {list.filter((o) => o.active).length} vigentes
        </h2>
        {list.length === 0 && <p className="card text-sm">Todavía no hay objetivos. Cargá el primero abajo o copialos de otra categoría.</p>}
        <ul className="space-y-2">
          {AREA_ORDER.flatMap((a) => list.filter((o) => o.area === a)).map((o) => {
            const st = last.get(o.id);
            return (
              <li key={o.id} className={`card space-y-2 p-3 ${o.active ? "" : "opacity-60"}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      <span className="mr-2 text-xs text-orc-muted tabular-nums">#{o.sort_order}</span>
                      {o.title}
                    </p>
                    <p className="text-xs text-orc-muted">
                      {objectiveAreaLabel[o.area]}
                      {o.exercise_name ? ` · Ejercicio: ${o.exercise_name}` : ""}
                      {st ? ` · ${st.achieved ? "Logrado" : "No logrado"} (última marca ${st.date.split("-").reverse().join("/")})` : " · Sin marcas"}
                    </p>
                  </div>
                  {o.active ? <span className="chip tone-green text-xs">Vigente</span> : <span className="chip text-xs">Desactivado</span>}
                </div>
                <Collapsible summary="Editar" className="text-sm">
                  <div className="mt-3 space-y-3">
                    <ActionForm action={updateObjective} submitLabel="Guardar cambios">
                      <input type="hidden" name="id" value={o.id} />
                      <input type="hidden" name="category_id" value={category.id} />
                      <ObjectiveFields o={o} prefix={o.id} />
                    </ActionForm>
                    <InlineAction
                      action={setObjectiveActive}
                      fields={{ id: o.id, category_id: category.id, active: String(!o.active) }}
                      label={o.active ? "Desactivar (deja de aparecer en el checklist)" : "Reactivar"}
                    />
                  </div>
                </Collapsible>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card space-y-3">
        <h2 className="text-lg font-bold">Nuevo objetivo para {category.name}</h2>
        <ActionForm action={createObjective} submitLabel="Agregar objetivo" resetOnSuccess>
          <input type="hidden" name="category_id" value={category.id} />
          <ObjectiveFields prefix="new" defaultOrder={(list.reduce((m, o) => Math.max(m, o.sort_order), 0) || 0) + 1} />
        </ActionForm>
      </section>

      <section className="card space-y-3">
        <div>
          <h2 className="text-lg font-bold">Copiar de otra categoría</h2>
          <p className="text-sm text-orc-muted">Trae los objetivos vigentes (los que ya existen con el mismo nombre no se duplican).</p>
        </div>
        <ActionForm action={copyObjectives} submitLabel="Copiar">
          <input type="hidden" name="category_id" value={category.id} />
          <Field label="Copiar desde" id="from_category">
            <select id="from_category" name="from_category" className="field-input" defaultValue="">
              <option value="" disabled>
                Elegir…
              </option>
              {categories
                .filter((c) => c.id !== category.id && count(c.id) > 0)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({count(c.id)})
                  </option>
                ))}
            </select>
          </Field>
        </ActionForm>
      </section>
    </div>
  );
}

function ObjectiveFields({ o, prefix, defaultOrder = 1 }: { o?: Row; prefix: string; defaultOrder?: number }) {
  const id = (k: string) => `${k}-${prefix}`;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem_6rem]">
        <Field label="Objetivo" id={id("title")}>
          <input id={id("title")} name="title" required maxLength={160} defaultValue={o?.title} placeholder="Ej.: El equipo va para adelante" className="field-input" />
        </Field>
        <Field label="Área" id={id("area")}>
          <select id={id("area")} name="area" defaultValue={o?.area ?? "game"} className="field-input">
            {AREA_ORDER.map((a) => (
              <option key={a} value={a}>
                {objectiveAreaLabel[a]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Orden" id={id("sort_order")}>
          <input id={id("sort_order")} name="sort_order" type="number" min={0} max={999} defaultValue={o?.sort_order ?? defaultOrder} className="field-input" />
        </Field>
      </div>
      <Field label="Qué mirar (cómo se da cuenta el profe de que se cumple)" id={id("look_for")}>
        <textarea id={id("look_for")} name="look_for" rows={2} maxLength={1000} defaultValue={o?.look_for ?? ""} className="field-input h-auto py-2 text-base" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Ejercicio (nombre)" id={id("exercise_name")}>
          <input id={id("exercise_name")} name="exercise_name" maxLength={120} defaultValue={o?.exercise_name ?? ""} className="field-input" />
        </Field>
        <Field label="Link a video o material (opcional)" id={id("exercise_url")}>
          <input id={id("exercise_url")} name="exercise_url" type="url" maxLength={500} defaultValue={o?.exercise_url ?? ""} placeholder="https://…" className="field-input" />
        </Field>
      </div>
      <Field label="Cómo se hace el ejercicio" id={id("exercise_description")}>
        <textarea id={id("exercise_description")} name="exercise_description" rows={3} maxLength={2000} defaultValue={o?.exercise_description ?? ""} className="field-input h-auto py-2 text-base" />
      </Field>
    </div>
  );
}
