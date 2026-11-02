import { ActionForm } from "@/components/action-form";
import { loadCatalog, requireAdmin, ROLE_OPTIONS } from "@/lib/admin";
import { canInviteByEmail } from "@/lib/supabase/admin";
import type { Category, Profile } from "@/lib/types";
import { inviteUser, updateUser } from "../actions";
import { Field } from "../jugadores/player-fields";

export const dynamic = "force-dynamic";

export default async function AdminUsers() {
  const { supabase, season, user } = await requireAdmin();
  const { categories } = await loadCatalog();
  const [profilesRes, assignRes] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, role, active").order("active").order("full_name"),
    supabase
      .from("coach_assignments")
      .select("profile_id, category_id")
      .eq("season_id", season?.id ?? "00000000-0000-0000-0000-000000000000"),
  ]);
  const profiles = (profilesRes.data ?? []) as Profile[];
  const assigned = new Map<string, Set<string>>();
  for (const a of assignRes.data ?? []) {
    const s = assigned.get(a.profile_id as string) ?? new Set<string>();
    s.add(a.category_id as string);
    assigned.set(a.profile_id as string, s);
  }
  const invite = canInviteByEmail();

  return (
    <div className="space-y-5">
      <section className="card space-y-3">
        <div>
          <h2 className="text-lg font-bold">Invitar a un profe o al área médica</h2>
          <p className="text-sm text-orc-muted">
            Le llega un email con un link para crear su contraseña. Entra ya activo y con las categorías que elijas.
          </p>
        </div>
        {invite ? (
          <ActionForm action={inviteUser} submitLabel="Enviar invitación" resetOnSuccess>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre y apellido" id="i_name">
                <input id="i_name" name="full_name" required className="field-input" />
              </Field>
              <Field label="Email" id="i_email">
                <input id="i_email" name="email" type="email" required className="field-input" />
              </Field>
            </div>
            <RoleAndCategories idPrefix="i" categories={categories} role="coach" selected={new Set()} seasonName={season?.name} />
          </ActionForm>
        ) : (
          <div className="rounded-lg border-l-4 border-orc-orange bg-orc-orange-soft p-3 text-sm">
            <p className="font-semibold">La invitación por email todavía no está habilitada.</p>
            <p className="mt-1">Mientras tanto, creá la cuenta desde Supabase y activala acá:</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5">
              <li>
                Supabase → <b>Authentication → Users → Add user → Send invitation</b> (o «Create new user» con una contraseña).
              </li>
              <li>La persona aparece abajo como «Pendiente».</li>
              <li>Elegí su rol, sus categorías, marcá «Activo» y guardá.</li>
            </ol>
            <p className="mt-2 text-orc-muted">
              Para invitar desde acá, agregá la variable <code>SUPABASE_SERVICE_ROLE_KEY</code> (Supabase → Settings → API
              Keys → secret) en Vercel → Settings → Environment Variables y volvé a publicar.
            </p>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-orc-muted">
          Usuarios ({profiles.length}) · categorías de la temporada {season?.name ?? "—"}
        </h2>
        <ul className="space-y-3">
          {profiles.map((p) => (
            <li key={p.id} className="card space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{p.full_name}</span>
                <span className="text-sm text-orc-muted">{p.email}</span>
                {p.id === user.id && <span className="chip bg-orc-chip text-orc-muted">Vos</span>}
                <span className={`chip ml-auto ${p.active ? "tone-green" : "tone-amber"}`}>{p.active ? "Activo" : "Pendiente"}</span>
              </div>
              <ActionForm action={updateUser} submitLabel="Guardar" submitClassName="btn-ghost h-10">
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="full_name" value={p.full_name} />
                <RoleAndCategories
                  idPrefix={p.id.slice(0, 8)}
                  categories={categories}
                  role={p.role}
                  selected={assigned.get(p.id) ?? new Set()}
                  seasonName={season?.name}
                />
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" name="active" defaultChecked={p.active} className="size-5 accent-orc-orange" />
                  Activo (puede entrar y ver datos)
                </label>
              </ActionForm>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function RoleAndCategories({
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
