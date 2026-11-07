import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { requireAdmin } from "@/lib/admin";
import type { Category, TestType } from "@/lib/types";
import { addExclusion, createProtocolVersion, removeExclusion, setCmjWeekly } from "./actions";

export const metadata: Metadata = { title: "Tests de cancha · Admin" };

const FIELD_TESTS = ["cmj", "sprint_40", "ift_30_15", "reaction"];

export default async function AdminTestsPage() {
  const { supabase } = await requireAdmin();
  const [typesRes, protRes, catRes, exclRes, weeklyRes] = await Promise.all([
    supabase.from("test_types").select("id, code, name, domain, protocol, sort_order").eq("active", true).order("sort_order"),
    supabase.from("test_protocols").select("id, test_type_id, version, params, notes, active, created_at").order("version", { ascending: false }),
    supabase.from("categories").select("id, code, name, level, sort_order").eq("active", true).order("sort_order"),
    supabase.from("category_test_exclusions").select("category_id, test_type_id, reason"),
    supabase.from("club_settings").select("value").eq("key", "cmj_weekly").maybeSingle(),
  ]);
  const types = (typesRes.data ?? []) as TestType[];
  const protocols = (protRes.data ?? []) as { id: string; test_type_id: string; version: number; params: object; notes: string | null; active: boolean; created_at: string }[];
  const categories = (catRes.data ?? []) as Category[];
  const exclusions = (exclRes.data ?? []) as { category_id: string; test_type_id: string; reason: string }[];
  const weekly = new Set(((weeklyRes.data?.value as { category_codes?: string[] } | null)?.category_codes ?? []) as string[]);
  const typeName = new Map(types.map((t) => [t.id, t.name]));
  const catName = new Map(categories.map((c) => [c.id, c.name]));

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-bold">Protocolos de los tests de cancha</h2>
          <p className="text-sm text-orc-muted">
            Cada parámetro (la g del CMJ, los fps mínimos, la progresión del IFT…) es parte de la versión del protocolo. Cambiar uno crea una{" "}
            <b>versión nueva</b>: lo que ya se midió queda con su versión y los gráficos avisan si se mezclan.
          </p>
        </div>
        {types
          .filter((t) => FIELD_TESTS.includes(t.code))
          .map((t) => {
            const list = protocols.filter((p) => p.test_type_id === t.id);
            const cur = list.find((p) => p.active);
            return (
              <details key={t.id} className="card">
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 font-semibold">
                  {t.name}
                  <span className="chip text-xs">{cur ? `v${cur.version} vigente` : "sin protocolo"}</span>
                </summary>
                <div className="mt-3 space-y-3 text-sm">
                  {cur?.notes && <p>{cur.notes}</p>}
                  <ActionForm action={createProtocolVersion} submitLabel="Crear versión nueva" submitClassName="btn-dark h-11">
                    <input type="hidden" name="test_type_id" value={t.id} />
                    <label className="flex flex-col">
                      <span className="label">Parámetros (JSON)</span>
                      <textarea name="params" rows={8} className="field-input font-mono text-xs" defaultValue={JSON.stringify(cur?.params ?? {}, null, 2)} />
                    </label>
                    <label className="flex flex-col">
                      <span className="label">Qué cambia (nota)</span>
                      <input name="notes" className="field-input h-10" defaultValue={cur?.notes ?? ""} />
                    </label>
                  </ActionForm>
                  {list.length > 1 && (
                    <p className="text-xs text-orc-muted">
                      Versiones anteriores: {list.filter((p) => !p.active).map((p) => `v${p.version}`).join(", ")}.
                    </p>
                  )}
                </div>
              </details>
            );
          })}
      </section>

      <section className="card space-y-3">
        <div>
          <h2 className="text-lg font-bold">CMJ semanal</h2>
          <p className="text-sm text-orc-muted">Categorías donde el preparador físico usa el control semanal de salto (base de 6 semanas).</p>
        </div>
        <ActionForm action={setCmjWeekly} submitLabel="Guardar" submitClassName="btn-dark h-11">
          <div className="flex flex-wrap gap-3">
            {categories.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="codes" value={c.code} defaultChecked={weekly.has(c.code)} className="size-5 accent-orc-orange" />
                {c.name}
              </label>
            ))}
          </div>
        </ActionForm>
      </section>

      <section className="card space-y-3">
        <div>
          <h2 className="text-lg font-bold">Qué mide cada categoría</h2>
          <p className="text-sm text-orc-muted">Cada etapa mide lo que puede entrenar. Los tests de esta lista no se pueden cargar en esa categoría (la app explica el motivo).</p>
        </div>
        <ul className="divide-y divide-orc-line">
          {exclusions
            .sort((a, b) => (catName.get(a.category_id) ?? "").localeCompare(catName.get(b.category_id) ?? ""))
            .map((e) => (
              <li key={`${e.category_id}:${e.test_type_id}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  <b>{catName.get(e.category_id)}</b> · {typeName.get(e.test_type_id)} — <span className="text-orc-muted">{e.reason}</span>
                </span>
                <ActionForm action={removeExclusion} submitLabel="Habilitar" submitClassName="btn-ghost h-9 text-xs" className="flex items-center gap-2">
                  <input type="hidden" name="category_id" value={e.category_id} />
                  <input type="hidden" name="test_type_id" value={e.test_type_id} />
                </ActionForm>
              </li>
            ))}
          {exclusions.length === 0 && <li className="py-2 text-sm text-orc-muted">Todas las categorías pueden cargar todos los tests.</li>}
        </ul>
        <ActionForm action={addExclusion} submitLabel="Agregar" submitClassName="btn-dark h-11" resetOnSuccess>
          <div className="grid gap-2 sm:grid-cols-3">
            <select name="category_id" className="field-input h-11" aria-label="Categoría" required>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select name="test_type_id" className="field-input h-11" aria-label="Test" required>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <input name="reason" className="field-input h-11" placeholder="Motivo (ej.: sin tests máximos con carga)" aria-label="Motivo" required />
          </div>
        </ActionForm>
      </section>
    </div>
  );
}
