"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useSync } from "./sync-provider";
import { supabaseBrowser } from "@/lib/supabase/client";
import { clearLocalData } from "@/lib/offline/db";
import { canEdit, canView, type Modules } from "@/lib/modules";
import { ThemeToggle } from "./theme-toggle";

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
  team: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M15.5 14.2A5 5 0 0 1 21 19" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  check: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <path d="m8 12.5 2.8 2.8L16.5 9" />
    </>
  ),
  stopwatch: (
    <>
      <circle cx="12" cy="13" r="7.5" />
      <path d="M12 13V9M10 2.5h4M18.5 6.5l1.5-1.5" />
    </>
  ),
  guide: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14M12 17h.01" />
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

interface NavOptions {
  canLoad: boolean;
  isAdmin?: boolean;
  isStaff?: boolean;
  modules?: Modules;
  /** Profe de infantiles: «Objetivos» va en la barra y «Evaluaciones» pasa a «Más». */
  infantile?: boolean;
}

/** Secciones del menú. Las «primary» van en la barra de abajo del celular; el resto, en «Más». */
export function navItems({ canLoad, isAdmin = false, isStaff = true, modules, infantile = false }: NavOptions): (NavItem & { primary: boolean })[] {
  const view = (m: Parameters<typeof canView>[1]) => !modules || canView(modules, m);
  const items: (NavItem & { primary: boolean; show: boolean })[] = [
    { href: "/", label: "Inicio", icon: <Icon>{icons.home}</Icon>, primary: true, show: true },
    { href: "/plantel", label: "Plantel", icon: <Icon>{icons.team}</Icon>, primary: true, show: isStaff },
    {
      href: "/practica",
      label: "Asistencia",
      icon: <Icon>{icons.objectives}</Icon>,
      primary: true,
      show: canLoad && view("attendance"),
    },
    {
      href: "/objetivos",
      label: "Objetivos",
      icon: <Icon>{icons.check}</Icon>,
      // Módulo propio: en la barra para los profes de infantiles (y para quien no carga
      // evaluaciones, p. ej. el coordinador que da el ok a los objetivos); en «Más» para el resto.
      primary: infantile || (!!modules && !canEdit(modules, "performance")),
      show: canLoad && view("objectives"),
    },
    {
      href: "/cargar",
      label: "Evaluaciones",
      icon: <Icon>{icons.load}</Icon>,
      primary: !infantile,
      show: canLoad && (!modules || canEdit(modules, "performance")),
    },
    {
      href: "/tests",
      label: "Tests de cancha",
      icon: <Icon>{icons.stopwatch}</Icon>,
      primary: false,
      show: canLoad && (!modules || canEdit(modules, "performance")),
    },
    { href: "/bienestar", label: "Bienestar", icon: <Icon>{icons.wellness}</Icon>, primary: false, show: view("wellness") },
    { href: "/lesiones", label: "Lesiones", icon: <Icon>{icons.injuries}</Icon>, primary: false, show: view("injuries") },
    { href: "/admin", label: "Admin", icon: <Icon>{icons.admin}</Icon>, primary: false, show: isAdmin },
  ];
  return items.filter((i) => i.show).map(({ show: _show, ...i }) => i);
}

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  // La categoría y el perfil del jugador son parte del Plantel.
  if (href === "/plantel") return pathname.startsWith("/plantel") || pathname.startsWith("/categorias") || pathname.startsWith("/jugadores");
  return pathname.startsWith(href);
}

/** Menú de arriba (computadora): las secciones principales y el resto en «Más ▾». */
export function TopNav(props: NavOptions) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const all = navItems(props);
  // En computadora hay lugar: «Admin» queda a la vista (lo usa seguido).
  const inline = (i: { href: string; primary: boolean }) => i.primary || i.href === "/admin";
  const primary = all.filter(inline);
  const more = [...all.filter((i) => !inline(i)), { href: "/guia", label: "Guía: qué medimos", icon: <Icon>{icons.guide}</Icon>, primary: false }];
  const moreActive = more.find((i) => isActive(pathname, i.href));

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !(e.target as HTMLElement).closest?.("[data-topnav-more]")) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const cls = (active: boolean) =>
    `whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold ${active ? "bg-orc-orange text-orc-black" : "text-white/80 hover:text-white"}`;

  return (
    <nav className="hidden items-center gap-1 md:flex" aria-label="Principal">
      {primary.map((i) => (
        <a key={i.href} href={i.href} className={cls(isActive(pathname, i.href))} aria-current={isActive(pathname, i.href) ? "page" : undefined}>
          {i.label}
        </a>
      ))}
      <div className="relative" data-topnav-more>
        <button type="button" className={cls(!!moreActive)} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)}>
          {moreActive ? moreActive.label : "Más"} <span aria-hidden>▾</span>
        </button>
        {open && (
          <div role="menu" aria-label="Más secciones" className="absolute left-0 top-full z-40 mt-1 min-w-56 rounded-lg border border-white/10 bg-orc-black p-1 shadow-xl">
            {more.map((i) => (
              <a
                key={i.href}
                href={i.href}
                role="menuitem"
                className={`flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold ${
                  isActive(pathname, i.href) ? "bg-orc-orange text-orc-black" : "text-white/85 hover:bg-white/10"
                }`}
              >
                {i.icon}
                {i.label}
              </a>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}

/** Barra de abajo (celular): hasta 4 secciones principales + «Más». */
export function BottomNav(props: NavOptions) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const all = navItems(props);
  const primary = all.filter((i) => i.primary);
  const more = [...all.filter((i) => !i.primary), { href: "/guia", label: "Guía: qué medimos", icon: <Icon>{icons.guide}</Icon>, primary: false }];
  const moreActive = more.some((i) => isActive(pathname, i.href));
  const cols = primary.length + 1;

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setOpen(false)} aria-hidden />
      )}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-orc-black pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="Principal"
      >
        {open && (
          <div id="nav-mas" className="border-b border-white/10 px-2 pb-2 pt-3" role="menu" aria-label="Más secciones">
            <ul className="grid grid-cols-2 gap-1">
              {more.map((i) => {
                const active = isActive(pathname, i.href);
                return (
                  <li key={i.href}>
                    <a
                      href={i.href}
                      role="menuitem"
                      className={`flex items-center gap-2 rounded-lg px-3 py-3 text-sm font-semibold ${
                        active ? "bg-orc-orange text-orc-black" : "text-white/85 hover:bg-white/10"
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
            <div className="mt-1 border-t border-white/10 px-1 pt-1">
              <LogoutButton className="w-full text-white/85 hover:bg-white/10" />
            </div>
          </div>
        )}
        <ul className="grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {primary.map((i) => {
            const active = isActive(pathname, i.href);
            return (
              <li key={i.href}>
                <a
                  href={i.href}
                  className={`flex flex-col items-center gap-0.5 py-2 text-xs font-semibold ${active ? "text-orc-orange" : "text-white/70"}`}
                  aria-current={active ? "page" : undefined}
                >
                  {i.icon}
                  {i.label}
                </a>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-controls="nav-mas"
              className={`flex w-full flex-col items-center gap-0.5 py-2 text-xs font-semibold ${open || moreActive ? "text-orc-orange" : "text-white/70"}`}
            >
              <Icon>{open ? icons.close : icons.more}</Icon>
              Más
            </button>
          </li>
        </ul>
      </nav>
    </>
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
export function LogoutButton({ className = "" }: { className?: string }) {
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
    try {
      // Corrida del 30-15 IFT en curso: se corta y se borra.
      window.localStorage.removeItem("orc-ift-run");
    } catch {
      /* sin storage */
    }
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
    <button
      type="button"
      onClick={() => void logout()}
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${className || "text-white/85 hover:bg-white/10"}`}
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4" />
      </svg>
      Cerrar sesión
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

/** Menú de cuenta (arriba a la derecha): nombre, rol, tema y cerrar sesión. */
export function AccountMenu({ name, role }: { name: string; role: string }) {
  const [open, setOpen] = useState(false);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="menu-cuenta"
        aria-label={`Cuenta de ${name}`}
        className={`grid size-9 place-items-center rounded-full border-2 text-sm font-black ${open ? "border-orc-orange bg-orc-orange text-orc-black" : "border-orc-orange/70 text-white"}`}
      >
        {initials || "?"}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div
            id="menu-cuenta"
            className="absolute right-0 top-11 z-50 w-64 rounded-xl border border-white/10 bg-orc-black p-3 text-white shadow-xl"
          >
            <p className="font-bold">{name}</p>
            <p className="text-sm text-white/60">{role}</p>
            <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
              <span className="text-sm text-white/70">Tema</span>
              <ThemeToggle />
            </div>
            <div className="mt-3 border-t border-white/10 pt-2">
              <LogoutButton className="w-full text-white hover:bg-white/10" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
