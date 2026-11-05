import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Collapsible } from "@/components/collapsible";
import { loadCatalog, requireAdmin } from "@/lib/admin";
import { canInviteByEmail } from "@/lib/supabase/admin";
import { effectiveModules, type AppModule, type ModuleLevel } from "@/lib/modules";
import type { Profile } from "@/lib/types";
import { inviteUser } from "../actions";
import { Field } from "../jugadores/player-fields";
import { RoleAndCategories } from "./user-fields";
import { UsersBrowser, type UserRow } from "./users-browser";

export const dynamic = "force-dynamic";

export default async function AdminUsers() {
  const { supabase, season, user } = await requireAdmin();
  const { categories } = await loadCatalog();
  const [profilesRes, assignRes, permsRes] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, role, active").order("full_name"),
    supabase
      .from("coach_assignments")
      .select("profile_id, category_id")
      .eq("season_id", season?.id ?? "00000000-0000-0000-0000-000000000000"),
    supabase.from("user_module_permissions").select("profile_id, module, level"),
  ]);
  const overrides = new Map<string, Partial<Record<AppModule, ModuleLevel>>>();
  for (const o of permsRes.data ?? []) {
    const m = overrides.get(o.profile_id as string) ?? {};
    m[o.module as AppModule] = o.level as ModuleLevel;
    overrides.set(o.profile_id as string, m);
  }
  const assigned = new Map<string, string[]>();
  for (const a of assignRes.data ?? []) {
    assigned.set(a.profile_id as string, [...(assigned.get(a.profile_id as string) ?? []), a.category_id as string]);
  }
  const users: UserRow[] = ((profilesRes.data ?? []) as Profile[]).map((p) => ({
    id: p.id,
    name: p.full_name,
    email: p.email ?? "",
    role: p.role,
    active: p.active,
    isMe: p.id === user.id,
    categoryIds: assigned.get(p.id) ?? [],
    modules: effectiveModules(p.role, true, overrides.get(p.id)),
    restricted: Object.keys(overrides.get(p.id) ?? {}).length,
  }));
  const pending = users.filter((u) => !u.active).length;
  const invite = canInviteByEmail();

  return (
    <div className="space-y-5">
      <section className="card">
        <Collapsible summary="+ Invitar a un profe o al área médica" initiallyOpen={users.length <= 1}>
          <div className="mt-3 space-y-3">
            <p className="text-sm text-orc-muted">
              Le llega un email con un link para crear su contraseña. Entra ya activo y con las categorías que elijas.
            </p>
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
                  <li>Abrila, elegí su rol, sus categorías, marcá «Activo» y guardá.</li>
                </ol>
                <p className="mt-2 text-orc-muted">
                  Para invitar desde acá, agregá la variable <code>SUPABASE_SERVICE_ROLE_KEY</code> (Supabase → Settings → API
                  Keys → secret) en Vercel → Settings → Environment Variables y volvé a publicar.
                </p>
              </div>
            )}
          </div>
        </Collapsible>
      </section>

      {pending > 0 && (
        <p className="rounded-lg tone-amber px-3 py-2 text-sm">
          {pending} {pending === 1 ? "usuario pendiente" : "usuarios pendientes"} de activación (filtrá por «Pendientes»).
        </p>
      )}

      <Suspense>
        <UsersBrowser users={users} categories={categories.map((c) => ({ id: c.id, code: c.code, name: c.name }))} seasonName={season?.name ?? "—"} />
      </Suspense>
    </div>
  );
}
