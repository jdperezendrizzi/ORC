import { ActionForm, InlineAction } from "@/components/action-form";
import { requireAdmin } from "@/lib/admin";
import { formatDate } from "@/lib/labels";
import { createSeason, setCurrentSeason } from "../actions";
import { Field } from "../jugadores/player-fields";

export const dynamic = "force-dynamic";

export default async function AdminSeasons() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from("seasons").select("id, name, starts_on, ends_on, is_current").order("starts_on", { ascending: false });
  const seasons = data ?? [];
  const last = seasons[0];
  const nextYear = last ? Number(String(last.name).match(/\d{4}/)?.[0] ?? new Date().getFullYear()) + 1 : new Date().getFullYear();
  const fmt = (d: string) => formatDate(d, { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="space-y-5">
      <section className="card space-y-3">
        <div>
          <h2 className="text-lg font-bold">Temporadas</h2>
          <p className="text-sm text-orc-muted">
            La temporada actual define qué jugadores ve cada profe (según la categoría asignada en esa temporada). El historial de
            temporadas anteriores se conserva.
          </p>
        </div>
        <ul className="divide-y divide-orc-line rounded-lg border border-orc-line">
          {seasons.map((s) => (
            <li key={s.id as string} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span>
                <span className="font-semibold">{s.name}</span>
                <span className="ml-2 text-sm text-orc-muted">
                  {fmt(s.starts_on as string)} – {fmt(s.ends_on as string)}
                </span>
              </span>
              {s.is_current ? (
                <span className="chip tone-green">Actual</span>
              ) : (
                <InlineAction
                  action={setCurrentSeason}
                  fields={{ id: s.id as string }}
                  label="Marcar como actual"
                  confirmText={`¿Pasar a la temporada ${s.name}? Los profes van a ver los planteles de esa temporada.`}
                />
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="card space-y-3">
        <div>
          <h2 className="text-lg font-bold">Nueva temporada</h2>
          <p className="text-sm text-orc-muted">
            Al terminar el año: 1) creá la temporada nueva; 2) <a href="/pase-de-temporada" className="font-semibold text-orc-orange-strong">Armar temporada</a>{" "}
            para pasar a cada categoría de una vez; 3) asigná a cada profe sus categorías (en Usuarios); 4) recién ahí marcala como
            actual.
          </p>
        </div>
        <ActionForm action={createSeason} submitLabel="Crear temporada" resetOnSuccess>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Nombre" id="s_name">
              <input id="s_name" name="name" required defaultValue={String(nextYear)} className="field-input" />
            </Field>
            <Field label="Empieza" id="s_start">
              <input id="s_start" name="starts_on" type="date" required defaultValue={`${nextYear}-01-01`} className="field-input" />
            </Field>
            <Field label="Termina" id="s_end">
              <input id="s_end" name="ends_on" type="date" required defaultValue={`${nextYear}-12-31`} className="field-input" />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="make_current" className="size-5 accent-orc-orange" />
            Marcarla como actual ahora
          </label>
        </ActionForm>
      </section>
    </div>
  );
}
