import { BottomNav, LogoutButton, PrecacheFieldPages, SyncBadge, TopNav } from "@/components/app-chrome";
import { SyncProvider } from "@/components/sync-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { canLoadResults, getViewer, roleLabel } from "@/lib/server-data";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await getViewer();
  const canLoad = canLoadResults(profile);

  return (
    <SyncProvider>
      <header className="sticky top-0 z-30 bg-orc-black pt-[env(safe-area-inset-top)] text-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4 sm:gap-3">
          <a href="/" className="flex items-center gap-2" aria-label="Inicio">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/crest.png" alt="" width={250} height={278} className="h-[34px] w-auto" />
            <span className="text-lg font-black tracking-tight">
              ORC <span className="text-orc-orange max-[420px]:hidden">Rendimiento</span>
            </span>
          </a>
          <div className="ml-4 flex-1">
            <TopNav canLoad={canLoad} />
          </div>
          <ThemeToggle />
          <SyncBadge />
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
          <footer className="mx-auto hidden max-w-5xl items-center justify-between px-4 pb-6 text-sm text-orc-muted md:flex">
            <span>
              {profile?.full_name} · {roleLabel[profile?.role ?? ""] ?? ""}
            </span>
            <span className="rounded bg-orc-black px-3 py-1">
              <LogoutButton />
            </span>
          </footer>
          <BottomNav canLoad={canLoad} />
          <PrecacheFieldPages />
        </>
      )}
    </SyncProvider>
  );
}
