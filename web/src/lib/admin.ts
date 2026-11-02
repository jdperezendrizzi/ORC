import "server-only";

import { redirect } from "next/navigation";
import { getViewer } from "./server-data";
import type { Category, Position } from "./types";

/** Corta si quien entra no es admin activo (la RLS igual lo bloquearía). */
export async function requireAdmin() {
  const viewer = await getViewer();
  if (!viewer.profile?.active || viewer.profile.role !== "admin") redirect("/");
  return viewer;
}

export async function loadCatalog() {
  const { supabase } = await getViewer();
  const [cats, pos] = await Promise.all([
    supabase.from("categories").select("id, code, name, level, sort_order").eq("active", true).order("sort_order"),
    supabase.from("positions").select("id, name, short_name, unit, line").order("id"),
  ]);
  return { categories: (cats.data ?? []) as Category[], positions: (pos.data ?? []) as Position[] };
}

export const CONSENT_TYPES: { code: string; label: string; required: boolean }[] = [
  { code: "performance_data", label: "Datos de rendimiento", required: true },
  { code: "medical_data", label: "Salud y lesiones", required: true },
  { code: "gps_tracking", label: "Monitoreo GPS", required: false },
  { code: "image_use", label: "Uso de imagen", required: false },
  { code: "data_sharing_family", label: "Acceso de la familia", required: false },
];

export const ROLE_OPTIONS: { value: string; label: string; help: string }[] = [
  { value: "coach", label: "Profe", help: "Ve y carga datos sólo de las categorías asignadas." },
  { value: "medical", label: "Área médica", help: "Ve todo el plantel, datos privados y lesiones; no carga testeos." },
  { value: "admin", label: "Admin", help: "Acceso total: jugadores, consentimientos, usuarios y temporadas." },
];
