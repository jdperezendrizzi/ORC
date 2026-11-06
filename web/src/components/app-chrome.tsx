"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useSync } from "./sync-provider";
import { supabaseBrowser } from "@/lib/supabase/client";
import { clearLocalData } from "@/lib/offline/db";
import { canEdit, canView, type Modules } from "@/lib/modules";

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
  objectives: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="m3.5 6 1.5 1.5L7.5 5M3.5 12l1.5 1.5L7.5 11" />
      <circle cx="5" cy="18" r="1.2" />
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

export function navItems(canLoad: boolean, isAdmin = false, modules?: Modules): NavItem[] {
  const view = (m: Parameters<typeof canView>[1]) => !modules || canView(modules, m);
  return [
    { href: "/", label: "Inicio", icon: <Icon>{icons.home}</Icon> },
    ...(canLoad && (!modules || canEdit(modules, "performance")) ? [{ href: "/cargar", label: "Cargar", icon: <Icon>{icons.load}</Icon> }] : []),
    ...(view("wellness") ? [{ href: "/bienestar", label: "Bienestar", icon: <Icon>{icons.wellness}</Icon> }] : []),
    ...(canLoad && (view("attendance") || view("objectives")) ? [{ href: "/practica", label: "Práctica", icon: <Icon>{icons.objectives}</Icon> }] : []),
    ...(view("injuries") ? [{ href: "/lesiones", label: "Lesiones", icon: <Icon>{icons.injuries}</Icon> }] : []),
    ...(isAdmin ? [{ href: "/admin", label: "Admin", icon: <Icon>{icons.admin}</Icon> }] : []),
  ];
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function TopNav({ canLoad, isAdmin = false, modules }: { canLoad: boolean; isAdmin?: boolean; modules?: Modules }) {
  const pathname = usePathname();
  return (
    <nav className="hidden items-center gap-1 md:flex" aria-label="Principal">
      {navItems(canLoad, isAdmin, modules).map((i) => (
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

export function BottomNav({ canLoad, isAdmin = false, modules }: { canLoad: boolean; isAdmin?: boolean; modules?: Modules }) {
  const pathname = usePathname();
  const items = navItems(canLoad, isAdmin, modules);
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
    // Al SW activo (puede no controlar todavía esta página).
    const reg = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
    (reg?.active ?? navigator.serviceWorker?.controller)?.postMessage({ type: "CLEAR_PAGES" });
    try {
      window.sessionStorage.removeItem(PRECACHE_KEY);
    } catch {
      /* sin storage */
    }
    await supabaseBrowser().auth.signOut();
    window.location.href = "/login";
  }
  return (
    <button type="button" onClick={logout} className="text-sm font-medium text-white/70 hover:text-white">
      Salir
    </button>
  );
}

const PRECACHE_KEY = "orc-precache-field-pages";

/**
 * Con sesión iniciada y señal, guarda las páginas de cancha para usarlas
 * offline. Una vez por sesión del navegador (no en cada página) y cuando el
 * navegador queda libre: así no compite con la carga de la página actual.
 */
export function PrecacheFieldPages() {
  useEffect(() => {
    if (!navigator.onLine || !("serviceWorker" in navigator)) return;
    try {
      if (window.sessionStorage.getItem(PRECACHE_KEY)) return;
    } catch {
      /* sin storage: se precarga igual */
    }
    const run = () => {
      navigator.serviceWorker.ready
        .then((reg) => {
          reg.active?.postMessage({ type: "PRECACHE_FIELD_PAGES" });
          try {
            window.sessionStorage.setItem(PRECACHE_KEY, "1");
          } catch {
            /* sin storage */
          }
        })
        .catch(() => undefined);
    };
    const hasIdle = typeof window.requestIdleCallback === "function";
    const id = hasIdle ? window.requestIdleCallback(run, { timeout: 5000 }) : setTimeout(run, 2000);
    return () => {
      if (hasIdle) window.cancelIdleCallback(id as number);
      else clearTimeout(id);
    };
  }, []);
  return null;
}
