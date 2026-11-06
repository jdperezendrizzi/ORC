// Permisos por módulo (espejo de la base: private.role_default_level /
// private.module_level). La base es la que manda; esto es para la UI.

import type { AppRole } from "./types";

export type AppModule =
  | "performance"
  | "wellness"
  | "attendance"
  | "objectives"
  | "injuries"
  | "promotion"
  | "insights"
  | "sharing"
  | "season_rollover";
export type ModuleLevel = "none" | "view" | "edit";
export type Modules = Record<AppModule, ModuleLevel>;

export const MODULES: { id: AppModule; label: string; help: string }[] = [
  { id: "performance", label: "Rendimiento", help: "Tests, sesiones, panel del equipo y perfil físico." },
  { id: "wellness", label: "Bienestar", help: "Registro diario de bienestar y carga." },
  { id: "attendance", label: "Asistencia", help: "Tomar asistencia y ver porcentajes." },
  { id: "objectives", label: "Objetivos", help: "Checklist de objetivos de la categoría." },
  { id: "injuries", label: "Lesiones", help: "Lista y registro de lesiones (las notas clínicas siguen siendo del área médica)." },
  { id: "promotion", label: "Pase de categoría", help: "Ficha de pase y recomendación (la decisión es del admin)." },
  { id: "insights", label: "Resumen y alertas", help: "Alertas y resumen semanal; «Carga» permite generarlo." },
  { id: "sharing", label: "Compartir", help: "PDF del jugador y Excel de la categoría." },
  {
    id: "season_rollover",
    label: "Pase de temporada",
    help: "Aplicar los pases de sus categorías a la temporada siguiente. Apagado por defecto: lo habilita el admin (sólo a profes).",
  },
];

export const levelLabel: Record<ModuleLevel, string> = { none: "No ve", view: "Ve", edit: "Carga" };
const ORDER: Record<ModuleLevel, number> = { none: 0, view: 1, edit: 2 };

/** Máximo que el admin puede habilitar por rol. */
export function roleMax(role: AppRole, module: AppModule): ModuleLevel {
  if (module === "season_rollover") return role === "admin" || role === "coach" ? "edit" : "none";
  return roleDefault(role, module);
}

/** Valor por defecto, sin ajustes del admin (= lo que cada rol podía antes de los permisos por módulo). */
export function roleDefault(role: AppRole, module: AppModule): ModuleLevel {
  if (module === "season_rollover") return role === "admin" ? "edit" : "none";
  if (role === "admin" || role === "coach") return "edit";
  if (role === "medical") {
    if (module === "performance" || module === "attendance" || module === "promotion") return "view";
    if (module === "objectives") return "none";
    return "edit";
  }
  return "none";
}

export const minLevel = (a: ModuleLevel, b: ModuleLevel): ModuleLevel => (ORDER[a] <= ORDER[b] ? a : b);

/** Nivel efectivo: el ajuste del admin (o el valor por defecto), sin pasar el máximo del rol (el admin, todo). */
export function effectiveModules(role: AppRole, active: boolean, overrides: Partial<Record<AppModule, ModuleLevel>> = {}): Modules {
  const out = {} as Modules;
  for (const m of MODULES) {
    out[m.id] = !active ? "none" : role === "admin" ? "edit" : minLevel(overrides[m.id] ?? roleDefault(role, m.id), roleMax(role, m.id));
  }
  return out;
}

export const canView = (mods: Modules | null | undefined, m: AppModule) => !!mods && ORDER[mods[m]] >= 1;
export const canEdit = (mods: Modules | null | undefined, m: AppModule) => !!mods && mods[m] === "edit";
