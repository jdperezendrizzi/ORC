"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MODULES, levelLabel, type AppModule, type ModuleLevel, type Modules } from "@/lib/modules";

export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  isMe: boolean;
  categoryIds: string[];
  modules: Modules;
  restricted: number;
}

const roleLabel: Record<string, string> = { admin: "Admin", coach: "Profe", medical: "Área médica", player: "Jugador", guardian: "Tutor" };
const levelTone: Record<ModuleLevel, string> = {
  edit: "bg-green-600 text-white",
  view: "bg-amber-400 text-orc-black",
  none: "bg-orc-chip text-orc-muted",
};
const levelShort: Record<ModuleLevel, string> = { edit: "C", view: "V", none: "—" };
const PAGE = 50;
export const FROM_LIST_KEY = "orc-admin-usuarios-desde-lista";

type View = "lista" | "permisos";

/** Usuarios con buscador, filtros y dos vistas (lista / grilla de permisos). */
export function UsersBrowser({
  users,
  categories,
  seasonName,
}: {
  users: UserRow[];
  categories: { id: string; code: string; name: string }[];
  seasonName: string;
}) {
  // Filtros en la URL: al volver del detalle se mantienen.
  const initial = useSearchParams();
  const [q, setQ] = useState(initial.get("q") ?? "");
  const [role, setRole] = useState(initial.get("rol") ?? "");
  const [status, setStatus] = useState(initial.get("estado") ?? "");
  const [cat, setCat] = useState(initial.get("cat") ?? "");
  const [onlyRestricted, setOnlyRestricted] = useState(initial.get("restr") === "1");
  const [view, setView] = useState<View>(initial.get("vista") === "permisos" ? "permisos" : "lista");
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    const u = new URL(window.location.href);
    const set = (k: string, v: string) => (v ? u.searchParams.set(k, v) : u.searchParams.delete(k));
    set("q", q);
    set("rol", role);
    set("estado", status);
    set("cat", cat);
    set("restr", onlyRestricted ? "1" : "");
    set("vista", view === "permisos" ? "permisos" : "");
    // Conserva el estado de Next en el historial (al volver se recupera la lista tal cual).
    window.history.replaceState(window.history.state, "", u);
    setLimit(PAGE);
  }, [q, role, status, cat, onlyRestricted, view]);

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

  const filtered = useMemo(() => {
    const term = norm(q.trim());
    return users
      .filter((u) => !term || norm(`${u.name} ${u.email}`).includes(term))
      .filter((u) => !role || u.role === role)
      .filter((u) => !status || (status === "activo" ? u.active : !u.active))
      .filter((u) => !cat || u.categoryIds.includes(cat))
      .filter((u) => !onlyRestricted || u.restricted > 0)
      .sort((a, b) => Number(a.active) - Number(b.active) || a.name.localeCompare(b.name));
  }, [users, q, role, status, cat, onlyRestricted]);

  const shown = filtered.slice(0, limit);
  const anyFilter = q || role || status || cat || onlyRestricted;
  const href = (id: string) => `/admin/usuarios/${id}`;
  const markFromList = () => {
    try {
      window.sessionStorage.setItem(FROM_LIST_KEY, "1");
    } catch {
      /* sin storage */
    }
  };

  return (
    <section className="space-y-3" aria-label="Usuarios">
      <div className="card space-y-3 p-3">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre o email…"
          aria-label="Buscar usuario"
          className="field-input"
        />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Rol" className="field-input h-10 text-sm">
            <option value="">Todos los roles</option>
            <option value="coach">Profes</option>
            <option value="medical">Área médica</option>
            <option value="admin">Admins</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Estado" className="field-input h-10 text-sm">
            <option value="">Activos y pendientes</option>
            <option value="activo">Activos</option>
            <option value="pendiente">Pendientes</option>
          </select>
          <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoría" className="field-input h-10 text-sm">
            <option value="">Todas las categorías</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={onlyRestricted} onChange={(e) => setOnlyRestricted(e.target.checked)} className="size-5 accent-orc-orange" />
            Con permisos ajustados
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-orc-muted" aria-live="polite">
            {filtered.length} de {users.length} usuarios
            {anyFilter && (
              <button
                type="button"
                className="ml-2 font-semibold text-orc-orange-strong underline"
                onClick={() => {
                  setQ("");
                  setRole("");
                  setStatus("");
                  setCat("");
                  setOnlyRestricted(false);
                }}
              >
                Limpiar filtros
              </button>
            )}
          </p>
          <div className="inline-flex rounded-lg border border-orc-line-strong p-0.5" role="tablist" aria-label="Vista">
            {(["lista", "permisos"] as View[]).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold ${view === v ? "bg-orc-orange text-orc-black" : ""}`}
              >
                {v === "lista" ? "Lista" : "Permisos"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="card text-sm">Ningún usuario coincide con la búsqueda.</p>
      ) : view === "lista" ? (
        <ul className="card divide-y divide-orc-line p-0">
          {shown.map((u) => (
            <li key={u.id}>
              <Link href={href(u.id)} onClick={markFromList} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-orc-orange-soft">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">
                    {u.name}
                    {u.isMe && <span className="chip ml-2 bg-orc-chip text-xs text-orc-muted">Vos</span>}
                  </span>
                  <span className="block truncate text-sm text-orc-muted">{u.email}</span>
                </span>
                <span className="flex flex-wrap items-center gap-1">
                  <span className="chip text-xs">{roleLabel[u.role] ?? u.role}</span>
                  {u.role === "coach" &&
                    (u.categoryIds.length ? (
                      u.categoryIds
                        .map((id) => catById.get(id))
                        .filter(Boolean)
                        .map((c) => (
                          <span key={c!.id} className="chip bg-orc-black text-xs text-orc-orange" title={c!.name}>
                            {c!.code}
                          </span>
                        ))
                    ) : (
                      <span className="chip tone-amber text-xs">Sin categorías</span>
                    ))}
                  {u.restricted > 0 && <span className="chip tone-amber text-xs">{u.restricted} ajustados</span>}
                  <span className={`chip text-xs ${u.active ? "tone-green" : "tone-amber"}`}>{u.active ? "Activo" : "Pendiente"}</span>
                  <span className="text-orc-muted" aria-hidden>
                    ›
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-orc-black text-left text-xs uppercase tracking-wide text-white">
              <tr>
                <th className="sticky left-0 bg-orc-black px-3 py-2">Usuario</th>
                {MODULES.map((m) => (
                  <th key={m.id} className="px-1 py-2 text-center" title={m.help}>
                    {m.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-orc-line">
              {shown.map((u) => (
                <tr key={u.id} className="hover:bg-orc-orange-soft">
                  <td className="sticky left-0 bg-orc-surface px-3 py-2">
                    <Link href={href(u.id)} onClick={markFromList} className="block max-w-[11rem] truncate font-semibold hover:underline">
                      {u.name}
                    </Link>
                    <span className="text-xs text-orc-muted">{roleLabel[u.role] ?? u.role}</span>
                  </td>
                  {MODULES.map((m) => {
                    const l = u.modules[m.id as AppModule];
                    return (
                      <td key={m.id} className="px-1 py-2 text-center">
                        <span
                          className={`inline-grid size-7 place-items-center rounded-md text-xs font-black ${levelTone[l]}`}
                          title={`${m.label}: ${levelLabel[l]}`}
                          aria-label={`${m.label}: ${levelLabel[l]}`}
                        >
                          {levelShort[l]}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-orc-line px-3 py-2 text-xs text-orc-muted">
            <b>C</b> = Carga · <b>V</b> = Ve · <b>—</b> = No ve. Tocá un usuario para cambiar sus permisos.
          </p>
        </div>
      )}

      {filtered.length > shown.length && (
        <button type="button" className="btn-ghost w-full" onClick={() => setLimit((l) => l + PAGE)}>
          Ver más ({filtered.length - shown.length})
        </button>
      )}
      <p className="text-xs text-orc-muted">Categorías de la temporada {seasonName}.</p>
    </section>
  );
}
