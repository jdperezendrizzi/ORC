import { redirect } from "next/navigation";
import { AccountMenu, BottomNav, LogoutButton, PrecacheFieldPages, SyncBadge, TopNav } from "@/components/app-chrome";
import { SyncProvider } from "@/components/sync-provider";
import { canLoadResults, getViewer, isStaff, roleLabel } from "@/lib/server-data";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, modules } = await getViewer();
  // Jugadores y familias usan su propio portal de solo lectura.
  if (profile && ["player", "guardian"].includes(profile.role)) redirect("/mi-jugador");
  const canLoad = canLoadResults(profile);
  const isAdmin = !!profile?.active && profile.role === "admin";

  return (
    <SyncProvider>
      <header className="sticky top-0 z-30 bg-orc-black pt-[env(safe-area-inset-top)] text-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4 sm:gap-3">
          <a href="/" className="flex items-center gap-2" aria-label="Inicio">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" width={514} height={560} className="h-[36px] w-auto" />
            <span className="text-lg font-black tracking-tight">
              ORC <span className="text-orc-orange max-[420px]:hidden">Rendimiento</span>
            </span>
          </a>
          <div className="ml-4 flex-1">
            <TopNav canLoad={canLoad} isAdmin={isAdmin} isStaff={isStaff(profile)} modules={modules} />
          </div>
          <SyncBadge />
          {profile && <AccountMenu name={profile.full_name} role={roleLabel[profile.role] ?? ""} />}
        </div>
        <div className="h-1 bg-orc-orange" aria-hidden />
      </header>

      {profile && !profile.active ? (
        <main className="mx-auto max-w-md px-4 py-10">
          <div className="card text-center">
            <h1 className="text-lg font-bold">Cuenta pendiente de activación</h1>
            <p className="mt-2 text-orc-muted">
              Un administrador del club tiene que habilitar tu usuario y asignarte una categoría.
            </p>
            <div className="mt-4 rounded-lg bg-orc-black py-2">
              <LogoutButton />
            </div>
          </div>
        </main>
      ) : (
        <>
          <main className="mx-auto max-w-5xl px-4 pb-28 pt-4 md:pb-10">{children}</main>
          <BottomNav canLoad={canLoad} isAdmin={isAdmin} isStaff={isStaff(profile)} modules={modules} />
          <PrecacheFieldPages />
        </>
      )}
    </SyncProvider>
  );
}
