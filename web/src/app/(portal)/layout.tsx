import { redirect } from "next/navigation";
import { AccountMenu } from "@/components/app-chrome";
import { SyncProvider } from "@/components/sync-provider";
import { NavProgress } from "@/components/nav-progress";
import { Suspense } from "react";
import { getViewer } from "@/lib/server-data";

/** Portal de solo lectura para jugadores y familias (sin el menú del cuerpo técnico). */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await getViewer();
  if (!profile || !["player", "guardian"].includes(profile.role)) redirect("/");
  return (
    <SyncProvider>
      <Suspense>
        <NavProgress />
      </Suspense>
      <header className="sticky top-0 z-30 bg-orc-black pt-[env(safe-area-inset-top)] text-white">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" width={514} height={560} className="h-[36px] w-auto" />
          <span className="flex-1 text-lg font-black tracking-tight">
            ORC <span className="text-orc-orange">Mi jugador</span>
          </span>
          <AccountMenu name={profile.full_name} role={profile.role === "player" ? "Jugador" : "Familia"} />
        </div>
        <div className="h-1 bg-orc-orange" aria-hidden />
      </header>
      {!profile.active ? (
        <main className="mx-auto max-w-md px-4 py-10">
          <p className="card text-center">Tu cuenta todavía no está activa. Consultá con el club.</p>
        </main>
      ) : (
        <main className="mx-auto max-w-3xl px-4 pb-16 pt-4">{children}</main>
      )}
    </SyncProvider>
  );
}
