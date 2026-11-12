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

type Tab = "asistencia" | "objetivos";
const CAN_USE = ["admin", "coach"];

/** Asistencia: tomar asistencia (al empezar) y objetivos (al terminar). Funciona sin señal. */
export function PracticeScreen({ only }: { only?: "objetivos" } = {}) {
  const { data, loading } = useFieldData();
  const { online } = useSync();
  const params = useSearchParams();
  const today = clubToday();
  const [tab, setTab] = useState<Tab>(only === "objetivos" || params.get("tab") === "objetivos" ? "objetivos" : "asistencia");
  const [categoryId, setCategoryId] = useState(params.get("categoria") ?? "");
  const [date, setDate] = useState(today);

  useEffect(() => {
    if (data && (!categoryId || !data.categories.some((c) => c.id === categoryId))) setCategoryId(data.categories[0]?.id ?? "");
  }, [data, categoryId]);

  // Mantener la URL al día sin navegar (así funciona sin señal).
  useEffect(() => {
    const u = new URL(window.location.href);
    if (!only) u.searchParams.set("tab", tab);
    if (categoryId) u.searchParams.set("categoria", categoryId);
    window.history.replaceState(null, "", u);
  }, [tab, categoryId, only]);

  if (!data) {
    return (
      <p className="card text-sm text-orc-muted">
        {loading ? "Cargando…" : "Abrí esta página una vez con señal para poder usarla sin conexión."}
      </p>
    );
  }
  if (!CAN_USE.includes(data.profile.role)) return <p className="card">La asistencia y los objetivos los cargan los entrenadores.</p>;
  const mods = fieldModules(data);
  const tabs = (only ? [only] : (["asistencia", "objetivos"] as Tab[])).filter((t) => canView(mods, t === "asistencia" ? "attendance" : "objectives"));
  if (tabs.length === 0) return <p className="card">No tenés habilitados {only ? "los objetivos" : "la asistencia ni los objetivos"}.</p>;
  const current = tabs.includes(tab) ? tab : tabs[0];
  const readOnly = !canEdit(mods, current === "asistencia" ? "attendance" : "objectives");

  return (
    <div className="space-y-4">
      <header className="space-y-3">
        <div>
          <h1 className="text-2xl font-black">{only ? "Objetivos" : "Asistencia"}</h1>
          <p className="text-sm text-orc-muted">
            {only ? "Al terminar la práctica, marcá cómo le fue al equipo en cada objetivo." : "Al empezar, la asistencia. Al terminar, los objetivos."}
            {!online && " Sin señal: se guarda en el celular y se sube sola."}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
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
          <label className="block">
            <span className="label">Fecha</span>
            <input type="date" className="field-input" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} />
          </label>
        </div>
        {!only && (
        <div className={`grid gap-1 rounded-xl bg-orc-chip p-1 ${tabs.length > 1 ? "grid-cols-2" : "grid-cols-1"}`} role="tablist">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={current === t}
              onClick={() => setTab(t)}
              className={`rounded-lg py-2 text-sm font-bold ${current === t ? "bg-orc-surface shadow-sm" : "text-orc-muted"}`}
            >
              {t === "asistencia" ? "Asistencia" : "Objetivos"}
            </button>
          ))}
        </div>
        )}
      </header>

      {readOnly && <p className="rounded-lg tone-amber px-3 py-2 text-sm">Sólo para ver: no tenés habilitada la carga de {current === "asistencia" ? "asistencia" : "objetivos"}.</p>}
      {categoryId &&
        (current === "asistencia" ? (
          <AttendanceTab
            data={data}
            categoryId={categoryId}
            date={date}
            readOnly={readOnly}
            onGoObjectives={
              tabs.includes("objetivos")
                ? () => {
                    setTab("objetivos");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }
                : undefined
            }
          />
        ) : (
          <ObjectivesChecklist data={data} categoryId={categoryId} date={date} readOnly={readOnly} />
        ))}
    </div>
  );
}
