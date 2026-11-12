import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { supabaseServer } from "./supabase/server";
import type { Category, Profile, Season } from "./types";
import { effectiveModules, type AppModule, type ModuleLevel } from "./modules";

/** Usuario + perfil + temporada actual (memoizado por request). */
export const getViewer = cache(async () => {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: season }, { data: overrides }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, role, active").eq("id", user.id).maybeSingle(),
    supabase.from("seasons").select("id, name, is_current").eq("is_current", true).maybeSingle(),
    supabase.from("user_module_permissions").select("module, level").eq("profile_id", user.id),
  ]);
  const p = profile as Profile | null;

  return {
    supabase,
    user,
    profile: p,
    season: season as Season | null,
    /** Niveles por módulo (la base aplica lo mismo en RLS). */
    modules: effectiveModules(
      p?.role ?? "player",
      !!p?.active,
      Object.fromEntries((overrides ?? []).map((o) => [o.module as AppModule, o.level as ModuleLevel])),
    ),
  };
});

/** Categorías que ve el usuario (coach: asignadas en la temporada; admin/medical: todas). */
export const getViewerCategories = cache(async (): Promise<Category[]> => {
  const { supabase, profile, season } = await getViewer();
  if (!profile?.active || !season) return [];

  if (profile.role === "coach") {
    const { data } = await supabase
      .from("coach_assignments")
      .select("category:categories(id, code, name, level, sort_order)")
      .eq("profile_id", profile.id)
      .eq("season_id", season.id);
    return ((data ?? []) as unknown as { category: Category }[])
      .map((r) => r.category)
      .sort((a, b) => a.sort_order - b.sort_order);
  }
  const { data } = await supabase
    .from("categories")
    .select("id, code, name, level, sort_order")
    .eq("active", true)
    .order("sort_order");
  return (data ?? []) as Category[];
});

/**
 * Categorías con objetivos DEL EQUIPO (infantiles): las anteriores a la
 * categoría desde la que los objetivos son por jugador (ajuste del club).
 */
export const getTeamObjectiveCategoryIds = cache(async (): Promise<Set<string>> => {
  const { supabase } = await getViewer();
  const categories = await getViewerCategories();
  const { data } = await supabase.from("club_settings").select("value").eq("key", "player_objectives_from").maybeSingle();
  const fromId = (data?.value as { category_id?: string } | null)?.category_id ?? null;
  let fromOrder: number | null = null;
  if (fromId) {
    const { data: c } = await supabase.from("categories").select("sort_order").eq("id", fromId).maybeSingle();
    fromOrder = (c?.sort_order as number | undefined) ?? null;
  }
  return new Set(categories.filter((c) => fromOrder === null || c.sort_order < fromOrder).map((c) => c.id));
});

/** Profe que sólo tiene categorías infantiles (objetivos del equipo): su barra prioriza «Objetivos». */
export async function isInfantileCoach(): Promise<boolean> {
  const { profile } = await getViewer();
  if (profile?.role !== "coach" || !profile.active) return false;
  const categories = await getViewerCategories();
  const team = await getTeamObjectiveCategoryIds();
  return categories.length > 0 && categories.every((c) => team.has(c.id));
}

export const canLoadResults = (p: Profile | null) => !!p?.active && (p.role === "admin" || p.role === "coach");
export const roleLabel: Record<string, string> = {
  admin: "Admin",
  coach: "Profe",
  medical: "Área médica",
  player: "Jugador",
  guardian: "Familia",
};

/** Área médica y admin gestionan lesiones (estado, alta, notas clínicas). */
export const canManageInjuries = (p: Profile | null) => !!p?.active && (p.role === "admin" || p.role === "medical");
export const isStaff = (p: Profile | null) => !!p?.active && ["admin", "coach", "medical"].includes(p.role);
