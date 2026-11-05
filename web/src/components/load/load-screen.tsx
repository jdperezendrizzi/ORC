"use client";

import { canEdit } from "@/lib/modules";
import { fieldModules } from "@/lib/offline/field-data";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useFieldData } from "../use-field-data";
import { useSync } from "../sync-provider";
import { SessionPicker } from "./session-picker";
import { TestPicker } from "./test-picker";
import { EntryGrid } from "./entry-grid";
import type { EvaluationSession } from "@/lib/types";
import { formatDate, sessionTypeLabel } from "@/lib/labels";

export function LoadScreen() {
  const params = useSearchParams();
  const { data, loading, error, updatedAt, refresh } = useFieldData();
  const { items } = useSync();
  const [sessionId, setSessionId] = useState<string | null>(params.get("sesion"));
  const [testTypeId, setTestTypeId] = useState<string | null>(null);
  // Sesiones creadas en este celular durante esta visita: siguen visibles
  // después de subirse (cuando salen de la outbox) hasta el próximo refresh.
  const [created, setCreated] = useState<EvaluationSession[]>([]);

  // Sesiones del servidor + las creadas en el celular que todavía no subieron.
  const sessions = useMemo<EvaluationSession[]>(() => {
    const local = items
      .filter((i) => i.table === "evaluation_sessions")
      .map((i) => i.row as unknown as EvaluationSession);
    const byId = new Map<string, EvaluationSession>();
    for (const s of [...(data?.sessions ?? []), ...created, ...local]) byId.set(s.id, s);
    return [...byId.values()].sort((a, b) => b.session_date.localeCompare(a.session_date));
  }, [data, items, created]);

  if (loading && !data) return <p className="py-10 text-center text-orc-muted">Cargando…</p>;
  if (!data) {
    return (
      <div className="card mx-auto mt-6 max-w-md text-center">
        <h1 className="font-bold">No hay datos en este celular</h1>
        <p className="mt-2 text-sm text-orc-muted">
          {error ?? "Abrí esta pantalla una vez con señal para descargar planteles y tests. Después funciona sin conexión."}
        </p>
      </div>
    );
  }
  if (data.profile.role !== "admin" && data.profile.role !== "coach") {
    return <p className="card mt-6 text-center text-orc-muted">Tu rol no carga evaluaciones.</p>;
  }
  if (!canEdit(fieldModules(data), "performance")) {
    return <p className="card mt-6 text-center text-orc-muted">No tenés habilitada la carga de rendimiento. Pedíselo al admin.</p>;
  }

  const session = sessions.find((s) => s.id === sessionId) ?? null;
  const testType = data.testTypes.find((t) => t.id === testTypeId) ?? null;
  const category = session ? data.categories.find((c) => c.id === session.category_id) : null;

  return (
    <div className="space-y-4">
      {/* Breadcrumb del flujo: sesión → test → grilla */}
      <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label="Pasos">
        <button
          type="button"
          onClick={() => {
            setSessionId(null);
            setTestTypeId(null);
          }}
          className={session ? "font-semibold text-orc-orange-strong" : "font-bold"}
        >
          Sesión
        </button>
        {session && (
          <>
            <span className="text-orc-muted">›</span>
            <button
              type="button"
              onClick={() => setTestTypeId(null)}
              className={testType ? "font-semibold text-orc-orange-strong" : "font-bold"}
            >
              {category?.name} · {session.title ?? sessionTypeLabel[session.session_type]} ·{" "}
              {formatDate(session.session_date)}
            </button>
          </>
        )}
        {testType && (
          <>
            <span className="text-orc-muted">›</span>
            <span className="font-bold">{testType.name}</span>
          </>
        )}
      </nav>

      {!session && (
        <SessionPicker
          data={data}
          sessions={sessions}
          initialCategoryId={params.get("categoria")}
          onSelect={(id) => setSessionId(id)}
          onCreated={(session) => {
            setCreated((c) => [...c, session]);
            setSessionId(session.id);
          }}
          updatedAt={updatedAt}
          onRefresh={refresh}
        />
      )}
      {session && !testType && (
        <TestPicker data={data} session={session} onSelect={(id) => setTestTypeId(id)} />
      )}
      {session && testType && (
        <EntryGrid key={`${session.id}:${testType.id}`} data={data} session={session} testType={testType} />
      )}
    </div>
  );
}
