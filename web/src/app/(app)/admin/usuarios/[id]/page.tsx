import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { loadCatalog, requireAdmin } from "@/lib/admin";
import { effectiveModules, type AppModule, type ModuleLevel } from "@/lib/modules";
import type { Profile } from "@/lib/types";
import { updateUser } from "../../actions";
import { ModulePermissions } from "../module-permissions";
import { RoleAndCategories } from "../user-fields";

export const metadata: Metadata = { title: "Usuario" };
export const dynamic = "force-dynamic";

export default async function AdminUser({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, season, user } = await requireAdmin();
  const { categories } = await loadCatalog();
  const [profileRes, assignRes, permsRes, sameRoleRes] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, role, active").eq("id", id).maybeSingle(),
    supabase
      .from("coach_assignments")
      .select("category_id")
      .eq("profile_id", id)
      .eq("season_id", season?.id ?? "00000000-0000-0000-0000-000000000000"),
    supabase.from("user_module_permissions").select("profile_id, module, level"),
    supabase.from("profiles").select("id, full_name, role").neq("id", id),
  ]);
  const p = profileRes.data as Profile | null;
  if (!p) notFound();

  const byProfile = new Map<string, Partial<Record<AppModule, ModuleLevel>>>();
  for (const o of permsRes.data ?? []) {
    const m = byProfile.get(o.profile_id as string) ?? {};
    m[o.module as AppModule] = o.level as ModuleLevel;
    byProfile.set(o.profile_id as string, m);
  }
  const mine = byProfile.get(id) ?? {};
  const others = (sameRoleRes.data ?? [])
    .filter((o) => o.role === p.role && byProfile.has(o.id as string))
    .map((o) => ({ id: o.id as string, name: o.full_name as string }));

  return (
    <div className="space-y-4">
      <Link href="/admin/usuarios" className="text-sm text-orc-muted" scroll={false}>
        ← Usuarios
      </Link>
      <section className="card space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold">{p.full_name}</h2>
          <span className="text-sm text-orc-muted">{p.email}</span>
          {p.id === user.id && <span className="chip bg-orc-chip text-orc-muted">Vos</span>}
          <span className={`chip ml-auto ${p.active ? "tone-green" : "tone-amber"}`}>{p.active ? "Activo" : "Pendiente"}</span>
        </div>
        <ActionForm action={updateUser} submitLabel="Guardar" submitClassName="btn-primary h-10">
          <input type="hidden" name="id" value={p.id} />
          <input type="hidden" name="full_name" value={p.full_name} />
          <RoleAndCategories
            idPrefix="u"
            categories={categories}
            role={p.role}
            selected={new Set((assignRes.data ?? []).map((a) => a.category_id as string))}
            seasonName={season?.name}
          />
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="active" defaultChecked={p.active} className="size-5 accent-orc-orange" />
            Activo (puede entrar y ver datos)
          </label>
        </ActionForm>
      </section>
      <section className="card">
        <ModulePermissions
          profileId={p.id}
          role={p.role}
          effective={effectiveModules(p.role, true, mine)}
          restricted={Object.keys(mine).length}
          others={others}
          initiallyOpen
        />
      </section>
    </div>
  );
}
