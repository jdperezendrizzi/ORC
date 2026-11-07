"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { addDays } from "@/lib/alerts";
import { cmjBaseline, cmjVerdict, verdictIcon, verdictLabel, VERDICT_DISCLAIMER, type CmjDayPoint } from "@/lib/field-tests/baseline";
import { loadCachedCmjHistory, refreshCmjHistory } from "@/lib/field-tests/client";
import { methodLabel } from "@/lib/field-tests/protocol";
import type { RosterPlayer } from "@/lib/types";
import { formatValue } from "@/lib/validation";
import { useSync } from "../sync-provider";
import { FieldTestFrame } from "./test-frame";
import { CmjPlayer } from "./cmj-screen";
import { PlayerPicker } from "./parts";
import type { FieldTestCtx } from "./use-field-test";

export function CmjWeeklyScreen() {
  return (
    <FieldTestFrame code="cmj" kind="cmj-semanal" title="CMJ semanal">
      {(ctx) => <WeeklyBody ctx={ctx} />}
    </FieldTestFrame>
  );
}

const TONE = { ok: "tone-green", warn: "tone-amber", crit: "tone-red" } as const;

function WeeklyBody({ ctx }: { ctx: FieldTestCtx<"cmj"> }) {
  const { lastSyncAt } = useSync();
  const [player, setPlayer] = useState<RosterPlayer | null>(null);
  const [history, setHistory] = useState<Record<string, CmjDayPoint[]>>({});
  const metric = ctx.metrics.find((m) => m.code === "cmj_height_cm");
  const w = ctx.params.weekly;
  const today = ctx.date;
  const categoryId = ctx.category?.id ?? "";

  useEffect(() => {
    if (!categoryId || !metric) return;
    let off = false;
    void (async () => {
      const cached = await loadCachedCmjHistory(categoryId);
      if (!off) setHistory(cached);
      if (navigator.onLine) {
        try {
          const fresh = await refreshCmjHistory(supabaseBrowser(), categoryId, ctx.roster.map((p) => p.id), metric.id, addDays(today, -(w.baseline_days + 7)));
          if (!off) setHistory(fresh);
        } catch {
          /* sin señal */
        }
      }
    })();
    return () => {
      off = true;
    };
  }, [categoryId, metric, ctx.roster, today, w.baseline_days, lastSyncAt]);

  // Hoy: mejor salto vigente por jugador y método
  const todayBest = (playerId: string) => {
    let best: { value: number; method: string } | null = null;
    for (const a of ctx.attempts) {
      if (a.player_id !== playerId || ctx.voids.has(a.id)) continue;
      const v = ctx.valuesOf(a)[0];
      if (v && (!best || v.value > best.value)) best = { value: v.value, method: a.method };
    }
    return best;
  };

  const base = (playerId: string, method: string) =>
    cmjBaseline(
      (history[playerId] ?? []).filter((p) => p.date !== today),
      today,
      method,
      w,
    );

  const statusLine = (p: RosterPlayer) => {
    const t = todayBest(p.id);
    const b = base(p.id, t?.method ?? "app");
    if (!t) return b.value === null ? `Sin base todavía: ${b.days} de ${b.needed} días` : `Base ${formatValue(b.value, 1)} cm (${b.days} días)`;
    if (b.value === null) return `Hoy ${formatValue(t.value, 1)} cm · sin base todavía (${b.days} de ${b.needed} días)`;
    const v = cmjVerdict(t.value, b.value, w);
    return `${verdictIcon[v.level]} ${verdictLabel[v.level]} · hoy ${formatValue(t.value, 1)} cm vs base ${formatValue(b.value, 1)}`;
  };

  if (!player) {
    return (
      <>
        <p className="text-sm text-orc-muted">
          Cada jugador salta {ctx.params.attempts} veces. La base es el promedio del mejor salto de cada día en los {w.baseline_days} días anteriores (mínimo{" "}
          {w.min_days} días, mismo método). Avisa si el salto queda más de {w.warn_drop_pct} % por debajo.
        </p>
        <PlayerPicker ctx={ctx} onSelect={setPlayer} hint={statusLine} />
      </>
    );
  }

  return (
    <CmjPlayer
      key={player.id}
      ctx={ctx}
      player={player}
      onBack={() => setPlayer(null)}
      footer={<Verdict ctx={ctx} player={player} todayBest={todayBest(player.id)} base={base} />}
    />
  );
}

function Verdict({
  player,
  todayBest,
  base,
  ctx,
}: {
  ctx: FieldTestCtx<"cmj">;
  player: RosterPlayer;
  todayBest: { value: number; method: string } | null;
  base: (playerId: string, method: string) => ReturnType<typeof cmjBaseline>;
}) {
  const method = todayBest?.method ?? "app";
  const b = base(player.id, method);
  const w = ctx.params.weekly;
  const v = useMemo(() => (todayBest && b.value !== null ? cmjVerdict(todayBest.value, b.value, w) : null), [todayBest, b.value, w]);
  return (
    <section className="card space-y-2" aria-label="Veredicto">
      <p className="text-sm">
        <b>Base ({methodLabel[method as keyof typeof methodLabel] ?? method}):</b>{" "}
        {b.value === null ? `sin base todavía: ${b.days} de ${b.needed} días` : `${formatValue(b.value, 1)} cm (promedio de ${b.days} días)`}
      </p>
      {v && todayBest && (
        <p className={`chip ${TONE[v.level]} text-base`} role="status">
          <span aria-hidden>{verdictIcon[v.level]}</span> {verdictLabel[v.level]}: hoy {formatValue(todayBest.value, 1)} cm,{" "}
          {v.dropPct > 0 ? `${formatValue(v.dropPct, 1)} % por debajo` : `${formatValue(-v.dropPct, 1)} % por encima`} de la base
        </p>
      )}
      <p className="text-xs text-orc-muted">{VERDICT_DISCLAIMER}</p>
    </section>
  );
}
