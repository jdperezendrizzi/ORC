"use client";

import Link from "next/link";
import { FROM_LIST_KEY } from "./users-browser";

/** «← Usuarios»: si se llegó desde la lista, vuelve atrás (con la búsqueda y los filtros tal cual). */
export function BackToUsers() {
  return (
    <Link
      href="/admin/usuarios"
      className="text-sm text-orc-muted"
      onClick={(e) => {
        try {
          if (window.sessionStorage.getItem(FROM_LIST_KEY)) {
            window.sessionStorage.removeItem(FROM_LIST_KEY);
            e.preventDefault();
            window.history.back();
          }
        } catch {
          /* sin storage: link normal */
        }
      }}
    >
      ← Usuarios
    </Link>
  );
}
