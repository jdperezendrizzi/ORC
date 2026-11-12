"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { clubToday } from "@/lib/validation";
import { canEdit, canView } from "@/lib/modules";
import { fieldModules } from "@/lib/offline/field-data";
import { useFieldData } from "./use-field-data";
import { useSync } from "./sync-provider";
import { AttendanceTab } from "./attendance-tab";
import { ObjectivesChecklist } from "./objectives-checklist";

const CAN_USE = ["admin", "coach"];

/**
 * Asistencia (por práctica, con fecha) u Objetivos (estado de la temporada,
 * se actualiza cuando hay un avance). Son dos módulos separados. Funciona sin señal.
 */
export function PracticeScreen({ only }: { only?: "objetivos" } = {}) {
  const mode = only === "objetivos" ? "objetivos" : "asistencia";
  const { data, loading } = useFieldData();
  const { online } = useSync();
  const params = useSearchParams();
  const today = clubToday();
  const [categoryId, setCategoryId] = useState(params.get("categoria") ?? "");
  const [date, setDate] = useState(today);

  // Links viejos (/practica?tab=objetivos) → módulo Objetivos
  useEffect(() => {
    if (mode === "asistencia" && params.get("tab") === "objetivos") {
      window.location.replace(`/objetivos${params.get("categoria") ? `?categoria=${params.get("categoria")}` : ""}`);
    }
  }, [mode, params]);

  useEffect(() => {
    if (data && (!categoryId || !data.categories.some((c) => c.id === categoryId))) setCategoryId(data.categories[0]?.id ?? "");
  }, [data, categoryId]);

  // Mantener la URL al día sin navegar (así funciona sin señal).
  useEffect(() => {
    const u = new URL(window.location.href);
    u.searchParams.delete("tab");
    if (categoryId) u.searchParams.set("categoria", categoryId);
    window.history.replaceState(null, "", u);
  }, [categoryId]);

  if (!data) {
    return (
      <p className="card text-sm text-orc-muted">
        {loading ? "Cargando…" : "Abrí esta página una vez con señal para poder usarla sin conexión."}
      </p>
    );
  }
  if (!CAN_USE.includes(data.profile.role)) {
    return <p className="card">{mode === "objetivos" ? "Los objetivos los marcan los entrenadores." : "La asistencia la toman los entrenadores."}</p>;
  }
  const mods = fieldModules(data);
  const module = mode === "asistencia" ? "attendance" : "objectives";
  if (!canView(mods, module)) {
    return <p className="card">No tenés habilitad{mode === "objetivos" ? "os los objetivos" : "a la asistencia"}. Pedíselo al admin.</p>;
  }
  const readOnly = !canEdit(mods, module);

  return (
    <div className="space-y-4">
      <header className="space-y-3">
        <div>
          <h1 className="text-2xl font-black">{mode === "objetivos" ? "Objetivos de la temporada" : "Asistencia"}</h1>
          <p className="text-sm text-orc-muted">
            {mode === "objetivos"
              ? "Marcá en qué punto está el equipo en cada objetivo y actualizalo cuando veas un avance."
              : "Tomá la asistencia al empezar la práctica."}
            {!online && " Sin señal: se guarda en el celular y se sube sola."}
          </p>
        </div>
        <div className={`grid gap-3 ${mode === "asistencia" ? "grid-cols-2" : "grid-cols-1 sm:max-w-sm"}`}>
          <label className="block">
            <span className="label">Categoría</span>
            <select className="field-input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {data.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {mode === "asistencia" && (
            <label className="block">
              <span className="label">Fecha</span>
              <input type="date" className="field-input" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} />
            </label>
          )}
        </div>
      </header>

      {readOnly && (
        <p className="rounded-lg tone-amber px-3 py-2 text-sm">
          Sólo para ver: no tenés habilitada la carga de {mode === "asistencia" ? "asistencia" : "objetivos"}.
        </p>
      )}
      {categoryId &&
        (mode === "asistencia" ? (
          <AttendanceTab data={data} categoryId={categoryId} date={date} readOnly={readOnly} />
        ) : (
          <ObjectivesChecklist data={data} categoryId={categoryId} date={today} readOnly={readOnly} />
        ))}
    </div>
  );
}
