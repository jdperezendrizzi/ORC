"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "Resumen" },
  { href: "/admin/jugadores", label: "Jugadores" },
  { href: "/admin/usuarios", label: "Usuarios" },
  { href: "/admin/temporada", label: "Temporada" },
];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Administración" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {TABS.map((t) => {
        const active = t.href === "/admin" ? pathname === "/admin" : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`opt shrink-0 px-4 py-2 text-sm ${active ? "border-orc-orange bg-orc-orange font-black text-orc-black" : ""}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
