"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useSync } from "./sync-provider";
import { supabaseBrowser } from "@/lib/supabase/client";
import { clearLocalData } from "@/lib/offline/db";

// Navegación con <a> (carga completa) a propósito: así funciona también
// sin señal, servida por el service worker.

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const icons = {
  home: (
    <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
  ),
  load: <path d="M12 5v14M5 12h14" />,
  admin: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
      <path d="M18.5 3.5l1 1.7 1.9.4-1.3 1.4.2 1.9-1.8-.8-1.8.8.2-1.9-1.3-1.4 1.9-.4z" />
    </>
  ),
  injuries: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  wellness: (
    <path d="M12 20s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 10c0 5.65-7 10-7 10z" />
  ),
};

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

export function navItems(canLoad: boolean, isAdmin = false): NavItem[] {
  return [
    { href: "/", label: "Inicio", icon: <Icon>{icons.home}</Icon> },
    ...(canLoad ? [{ href: "/cargar", label: "Cargar", icon: <Icon>{icons.load}</Icon> }] : []),
    { href: "/bienestar", label: "Bienestar", icon: <Icon>{icons.wellness}</Icon> },
    { href: "/lesiones", label: "Lesiones", icon: <Icon>{icons.injuries}</Icon> },
    ...(isAdmin ? [{ href: "/admin", label: "Admin", icon: <Icon>{icons.admin}</Icon> }] : []),
  ];
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function TopNav({ canLoad, isAdmin = false }: { canLoad: boolean; isAdmin?: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="hidden items-center gap-1 md:flex" aria-label="Principal">
      {navItems(canLoad, isAdmin).map((i) => (
        <a
          key={i.href}
          href={i.href}
          className={`rounded-md px-3 py-2 text-sm font-semibold ${
            isActive(pathname, i.href) ? "bg-orc-orange text-orc-black" : "text-white/80 hover:text-white"
          }`}
        >
          {i.label}
        </a>
      ))}
    </nav>
  );
}

export function BottomNav({ canLoad, isAdmin = false }: { canLoad: boolean; isAdmin?: boolean }) {
  const pathname = usePathname();
  const items = navItems(canLoad, isAdmin);
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-orc-black pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Principal"
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((i) => {
          const active = isActive(pathname, i.href);
          return (
            <li key={i.href}>
              <a
                href={i.href}
                className={`flex flex-col items-center gap-0.5 py-2 text-xs font-semibold ${
                  active ? "text-orc-orange" : "text-white/70"
                }`}
                aria-current={active ? "page" : undefined}
              >
                {i.icon}
                {i.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Indicador de conexión y cambios pendientes. */
export function SyncBadge() {
  const { online, syncing, pending, errors, syncNow } = useSync();
  let label: string;
  let tone: string;
  if (errors > 0) {
    label = `${errors} con error`;
    tone = "bg-red-600 text-white";
  } else if (!online) {
    label = pending ? `Sin señal · ${pending} pend.` : "Sin señal";
    tone = "bg-white/15 text-white";
  } else if (syncing || pending) {
    label = pending ? `Subiendo ${pending}…` : "Sincronizando…";
    tone = "bg-orc-orange text-orc-black";
  } else {
    label = "Al día";
    tone = "bg-white/10 text-white/80";
  }
  return (
    <button
      type="button"
      onClick={() => void syncNow()}
      className={`chip h-8 shrink-0 whitespace-nowrap px-3 ${tone}`}
      aria-live="polite"
      title="Sincronizar ahora"
    >
      <span className={`size-2 rounded-full ${online ? "bg-green-400" : "bg-white/40"}`} aria-hidden />
      {label}
    </button>
  );
}

/** Cerrar sesión: avisa si hay datos sin subir y limpia el dispositivo. */
export function LogoutButton() {
  const { pending, errors } = useSync();
  async function logout() {
    const unsynced = pending + errors;
    if (
      unsynced > 0 &&
      !window.confirm(`Hay ${unsynced} dato(s) sin subir. Si cerrás sesión se pierden. ¿Cerrar igual?`)
    ) {
      return;
    }
    await clearLocalData();
    navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_PAGES" });
    await supabaseBrowser().auth.signOut();
    window.location.href = "/login";
  }
  return (
    <button type="button" onClick={logout} className="text-sm font-medium text-white/70 hover:text-white">
      Salir
    </button>
  );
}

/** Con sesión iniciada y señal, guarda las páginas de cancha para usarlas offline. */
export function PrecacheFieldPages() {
  useEffect(() => {
    if (!navigator.onLine || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.active?.postMessage({ type: "PRECACHE_FIELD_PAGES" }))
      .catch(() => undefined);
  }, []);
  return null;
}
