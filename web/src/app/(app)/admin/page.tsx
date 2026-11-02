import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { canInviteByEmail } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const { supabase, season } = await requireAdmin();

  const [players, psc, consents, profiles, guardiansLinks] = await Promise.all([
    supabase.from("players").select("id, birth_date, active").eq("active", true).is("deleted_at", null),
    supabase.from("player_season_categories").select("player_id").eq("season_id", season?.id ?? "00000000-0000-0000-0000-000000000000"),
    supabase.from("consents").select("player_id, consent_type").is("revoked_at", null),
    supabase.from("profiles").select("id, active, role"),
    supabase.from("player_guardians").select("player_id"),
  ]);

  const active = players.data ?? [];
  const inSeason = new Set((psc.data ?? []).map((r) => r.player_id as string));
  const consented = new Set(
    (consents.data ?? []).filter((c) => c.consent_type === "performance_data").map((c) => c.player_id as string),
  );
  const withGuardian = new Set((guardiansLinks.data ?? []).map((r) => r.player_id as string));
  const isMinor = (b: string) => (Date.now() - Date.parse(b)) / (365.25 * 864e5) < 18;

  const noCategory = active.filter((p) => !inSeason.has(p.id as string)).length;
  const noConsent = active.filter((p) => !consented.has(p.id as string)).length;
  const minorsNoGuardian = active.filter((p) => isMinor(p.birth_date as string) && !withGuardian.has(p.id as string)).length;
  const pendingUsers = (profiles.data ?? []).filter((p) => !p.active).length;

  const todo = [
    { n: noConsent, text: "jugadores sin consentimiento de datos de rendimiento", hint: "Los profes no pueden cargarles testeos.", href: "/admin/jugadores?filtro=sin-consentimiento" },
    { n: minorsNoGuardian, text: "menores sin tutor cargado", hint: "Un menor sólo puede consentir a través de un tutor.", href: "/admin/jugadores?filtro=sin-tutor" },
    { n: noCategory, text: `jugadores sin categoría en la temporada ${season?.name ?? ""}`, hint: "No aparecen para ningún profe.", href: "/admin/jugadores?filtro=sin-categoria" },
    { n: pendingUsers, text: "usuarios pendientes de activar", hint: "No ven nada hasta que los actives.", href: "/admin/usuarios" },
  ].filter((t) => t.n > 0);

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Jugadores activos" value={active.length} />
        <Stat label={`En temporada ${season?.name ?? "—"}`} value={inSeason.size} />
        <Stat label="Con consentimiento" value={active.filter((p) => consented.has(p.id as string)).length} />
        <Stat label="Usuarios" value={(profiles.data ?? []).length} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-orc-muted">Pendientes</h2>
        {todo.length === 0 ? (
          <p className="card text-sm">Todo en orden: no hay pendientes.</p>
        ) : (
          <ul className="card divide-y divide-orc-line p-0">
            {todo.map((t) => (
              <li key={t.text}>
                <Link href={t.href} className="flex items-center gap-3 px-4 py-3 hover:bg-orc-orange-soft">
                  <span className="chip tone-amber min-w-9 justify-center text-sm">{t.n}</span>
                  <span className="flex-1">
                    <span className="block font-semibold">{t.text}</span>
                    <span className="text-sm text-orc-muted">{t.hint}</span>
                  </span>
                  <span className="text-orc-muted">›</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Link href="/admin/jugadores/nuevo" className="btn-primary h-14">
          + Nuevo jugador
        </Link>
        <Link href="/admin/usuarios" className="btn-ghost h-14">
          {canInviteByEmail() ? "Invitar profe o médico" : "Usuarios y permisos"}
        </Link>
        <Link href="/admin/temporada" className="btn-ghost h-14">
          Temporadas
        </Link>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card py-3">
      <p className="text-3xl font-black tabular-nums">{value}</p>
      <p className="text-sm text-orc-muted">{label}</p>
    </div>
  );
}
