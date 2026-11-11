import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { fetchAll } from "@/lib/fetch-all";
import { ratesByPlayer, type AttendanceRow } from "@/lib/attendance";
import { canView } from "@/lib/modules";
import { playerProgress } from "@/lib/objectives";
import type { Objective, ObjectiveCheck } from "@/lib/types";
import { clubToday } from "@/lib/validation";
import { getViewer, getViewerCategories, isStaff } from "@/lib/server-data";
import { ageOn } from "@/lib/validation";
import { RosterBrowser, type RosterRow } from "./roster-browser";

export const metadata: Metadata = { title: "Plantel" };
export const dynamic = "force-dynamic";

/** Plantel: todos los jugadores de las categorías del usuario, con búsqueda y filtros. */
export default async function PlantelPage() {
  const { supabase, season, profile, modules } = await getViewer();
  if (!season || !isStaff(profile)) notFound();
  const categories = await getViewerCategories();
  const ids = categories.map((c) => c.id);
  const seeAtt = canView(modules, "attendance");
  const seeInj = canView(modules, "injuries");
  const seeObj = canView(modules, "objectives");
  const none = ["00000000-0000-0000-0000-000000000000"];

  const [roster, positionsRes, consentsRes, injuriesRes, attendance, objRes, objChecks] = await Promise.all([
    fetchAll<{
      category_id: string;
      position_id: number | null;
      jersey_number: number | null;
      player: { id: string; first_name: string; last_name: string; birth_date: string; primary_position_id: number | null; active: boolean };
    }>(
      () =>
        supabase
          .from("player_season_categories")
          .select("category_id, position_id, jersey_number, player:players!inner(id, first_name, last_name, birth_date, primary_position_id, active)")
          .eq("season_id", season.id)
          .in("category_id", ids.length ? ids : none)
          .order("id") as never,
    ),
    supabase.from("positions").select("id, short_name, unit"),
    supabase.from("consents").select("player_id, consent_type").is("revoked_at", null),
    seeInj
      ? supabase.from("injuries").select("player_id, status").neq("status", "closed").is("deleted_at", null)
      : Promise.resolve({ data: [] as { player_id: string; status: string }[] }),
    seeAtt
      ? fetchAll<AttendanceRow>(
          () =>
            supabase
              .from("attendance")
              .select("id, player_id, category_id, season_id, att_date, kind, status, note")
              .eq("season_id", season.id)
              .in("category_id", ids.length ? ids : none)
              .order("id") as never,
        )
      : Promise.resolve([] as AttendanceRow[]),
    seeObj
      ? supabase
          .from("objectives")
          .select("id, category_id, scope, area, title, sort_order")
          .eq("scope", "player")
          .eq("active", true)
          .in("category_id", ids.length ? ids : none)
      : Promise.resolve({ data: [] as Objective[] }),
    seeObj
      ? fetchAll<ObjectiveCheck>(
          () =>
            supabase
              .from("objective_checks")
              .select("id, objective_id, season_id, check_date, player_id, achieved, note")
              .eq("season_id", season.id)
              .order("id") as never,
        )
      : Promise.resolve([] as ObjectiveCheck[]),
  ]);
  const pObjs = (objRes.data ?? []) as Objective[];
  const today = clubToday();

  const positions = new Map((positionsRes.data ?? []).map((p) => [p.id as number, { short: p.short_name as string, unit: p.unit as string }]));
  const perf = new Set((consentsRes.data ?? []).filter((c) => c.consent_type === "performance_data").map((c) => c.player_id as string));
  const injured = new Map(((injuriesRes.data ?? []) as { player_id: string; status: string }[]).map((i) => [i.player_id, i.status]));
  const rates = ratesByPlayer(attendance);
  const catById = new Map(categories.map((c) => [c.id, c]));

  const rows: RosterRow[] = roster
    .filter((r) => r.player.active)
    .map((r) => {
      const pos = positions.get((r.position_id ?? r.player.primary_position_id) as number);
      const c = catById.get(r.category_id)!;
      return {
        id: r.player.id,
        name: `${r.player.last_name}, ${r.player.first_name}`,
        categoryId: r.category_id,
        categoryCode: c?.code ?? "",
        jersey: r.jersey_number,
        position: pos?.short ?? null,
        unit: (pos?.unit as "forwards" | "backs") ?? null,
        age: ageOn(r.player.birth_date),
        attendancePct: rates.get(r.player.id)?.pct ?? null,
        injury: injured.get(r.player.id) ?? null,
        noConsent: !perf.has(r.player.id),
        objectives: (() => {
          const mine = pObjs.filter((o) => o.category_id === r.category_id);
          return mine.length ? playerProgress(mine, objChecks, r.player.id, today) : null;
        })(),
      };
    });

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-orc-muted">Temporada {season.name}</p>
          <h1 className="text-2xl font-black">Plantel</h1>
        </div>
        {categories.length > 0 && (
          <a href={`/plantel/estado?categoria=${categories[0].id}`} className="btn-dark h-11">
            Estado del equipo · compartir
          </a>
        )}
      </header>
      {categories.length === 0 ? (
        <p className="card text-sm">No tenés categorías asignadas. Pedíselo al admin.</p>
      ) : (
        <Suspense>
          <RosterBrowser
            rows={rows}
            categories={categories.map((c) => ({ id: c.id, code: c.code, name: c.name }))}
            showAttendance={seeAtt}
            showInjuries={seeInj}
          />
        </Suspense>
      )}
    </div>
  );
}
