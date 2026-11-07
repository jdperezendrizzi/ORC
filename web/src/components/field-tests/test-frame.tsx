"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, type ReactNode } from "react";
import { canEdit } from "@/lib/modules";
import { fieldModules, type FieldData } from "@/lib/offline/field-data";
import type { FieldSessionKind } from "@/lib/field-tests/client";
import type { FieldTestCode } from "@/lib/field-tests/protocol";
import { clubToday } from "@/lib/validation";
import { useFieldData } from "../use-field-data";
import { useFieldTest, type FieldTestCtx } from "./use-field-test";

const LAST_CATEGORY_KEY = "orc-tests-category";

/** Marco común: datos de cancha, permisos, categoría y fecha. */
export function FieldTestFrame<K extends FieldTestCode>({
  code,
  title,
  kind = "tests",
  children,
}: {
  code: K;
  title: string;
  kind?: FieldSessionKind;
  children: (ctx: FieldTestCtx<K>) => ReactNode;
}) {
  const { data, loading, error } = useFieldData();
  if (loading && !data) return <p className="py-10 text-center text-orc-muted">Cargando…</p>;
  if (!data) {
    return (
      <div className="card mx-auto mt-6 max-w-md text-center">
        <h1 className="font-bold">No hay datos en este celular</h1>
        <p className="mt-2 text-sm text-orc-muted">{error ?? "Abrí esta pantalla una vez con señal para descargar planteles y tests. Después funciona sin conexión."}</p>
      </div>
    );
  }
  const gate = fieldTestsGate(data);
  if (gate) return <p className="card mt-6 text-center text-orc-muted">{gate}</p>;
  return (
    <Inner data={data} code={code} title={title} kind={kind}>
      {children}
    </Inner>
  );
}

export function fieldTestsGate(data: FieldData): string | null {
  if (data.profile.role !== "admin" && data.profile.role !== "coach") return "Tu rol no carga tests.";
  if (!canEdit(fieldModules(data), "performance")) return "No tenés habilitada la carga de evaluaciones. Pedíselo al admin.";
  return null;
}

/** Categorías donde se puede usar el flujo (el CMJ semanal sólo en las configuradas). */
export function categoriesFor(data: FieldData, kind: FieldSessionKind) {
  if (kind !== "cmj-semanal") return data.categories;
  const codes = new Set(data.cmjWeeklyCodes ?? ["M17", "M19"]);
  return data.categories.filter((c) => codes.has(c.code));
}

function Inner<K extends FieldTestCode>({ data, code, title, kind, children }: { data: FieldData; code: K; title: string; kind: FieldSessionKind; children: (ctx: FieldTestCtx<K>) => ReactNode }) {
  const params = useSearchParams();
  const router = useRouter();
  const today = clubToday();
  const categories = useMemo(() => categoriesFor(data, kind), [data, kind]);
  const stored = typeof window === "undefined" ? null : safeGet(LAST_CATEGORY_KEY);
  const categoryId =
    [params.get("categoria"), stored].find((id) => id && categories.some((c) => c.id === id)) ?? categories[0]?.id ?? "";
  const date = params.get("fecha") && params.get("fecha")! <= today ? params.get("fecha")! : today;

  useEffect(() => {
    if (categoryId) safeSet(LAST_CATEGORY_KEY, categoryId);
  }, [categoryId]);

  const setParam = (k: string, v: string) => {
    const q = new URLSearchParams(params.toString());
    q.set(k, v);
    router.replace(`?${q.toString()}`, { scroll: false });
  };

  const ctx = useFieldTest(data, code, categoryId, date, kind);

  return (
    <div className="space-y-4">
      <div>
        <Link href={`/tests?categoria=${categoryId}`} className="text-sm font-semibold text-orc-orange-strong">
          ← Tests de cancha
        </Link>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-black">{title}</h1>
          {ctx.protocol && <span className="chip text-xs">Protocolo v{ctx.protocol.version}</span>}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <label className="flex flex-col text-sm">
          <span className="label">Categoría</span>
          <select className="field-input h-11" value={categoryId} onChange={(e) => setParam("categoria", e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-sm">
          <span className="label">Fecha</span>
          <input type="date" className="field-input h-11" value={date} max={today} onChange={(e) => e.target.value && setParam("fecha", e.target.value)} />
        </label>
      </div>

      {categories.length === 0 ? (
        <p className="card text-sm">
          {kind === "cmj-semanal" ? "El CMJ semanal no está habilitado en tus categorías. El admin lo configura en Admin › Tests." : "No tenés categorías asignadas."}
        </p>
      ) : !ctx.testType ? (
        <p className="card text-sm">Este test no está en el catálogo.</p>
      ) : ctx.exclusion ? (
        <p className="card border-l-4 border-l-amber-500 text-sm" role="alert">
          <span aria-hidden>⚠ </span>
          <b>No corresponde a {ctx.category?.name}:</b> {ctx.exclusion.reason}.
        </p>
      ) : !ctx.protocol ? (
        <p className="card text-sm">Falta el protocolo de este test en el celular: abrí la app con señal para actualizar.</p>
      ) : ctx.roster.length === 0 ? (
        <p className="card text-sm">No hay jugadores en esta categoría para la temporada.</p>
      ) : (
        children(ctx)
      )}
    </div>
  );
}

function safeGet(k: string) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function safeSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* modo privado */
  }
}
