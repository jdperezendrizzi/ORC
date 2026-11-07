"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useFieldData } from "../use-field-data";
import { categoriesFor, fieldTestsGate } from "./test-frame";

const TESTS = [
  { code: "cmj", href: "/tests/cmj", title: "CMJ", desc: "Salto con contramovimiento: altura, tiempo de vuelo o video en cámara lenta.", icon: "⤒" },
  { code: "cmj", href: "/tests/cmj-semanal", title: "CMJ semanal", desc: "Control rápido de fatiga: compara el salto con la base de las últimas 6 semanas.", icon: "↻", weekly: true },
  { code: "sprint_40", href: "/tests/sprint", title: "Sprint 10/20/40 m", desc: "Foto-finish con un solo celular (cámara lenta) o fotocélula. Calcula la Vmax.", icon: "➜" },
  { code: "ift_30_15", href: "/tests/ift", title: "30-15 IFT", desc: "La app da las señales sonoras y vos marcás quién no llega. Calcula la VIFT.", icon: "♪" },
  { code: "reaction", href: "/tests/reaccion", title: "Reacción", desc: "Simple o go/no-go en la pantalla. Sólo se compara al jugador consigo mismo.", icon: "◉" },
] as const;

export function FieldTestsHub() {
  const { data, loading, error } = useFieldData();
  const params = useSearchParams();
  const [categoryId, setCategoryId] = useState<string>("");
  useEffect(() => {
    if (!data) return;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem("orc-tests-category");
    } catch {
      /* modo privado */
    }
    const id = [params.get("categoria"), stored].find((x) => x && data.categories.some((c) => c.id === x)) ?? data.categories[0]?.id ?? "";
    setCategoryId(id);
  }, [data, params]);

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
  const category = data.categories.find((c) => c.id === categoryId);
  const weeklyOk = categoriesFor(data, "cmj-semanal").some((c) => c.id === categoryId);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black">Tests de cancha</h1>
        <p className="text-sm text-orc-muted">Tomá el dato con tu celular. Funciona sin señal: se sube solo cuando vuelve la conexión.</p>
      </div>
      {gate ? (
        <p className="card text-center text-orc-muted">{gate}</p>
      ) : (
        <>
          <label className="flex max-w-xs flex-col text-sm">
            <span className="label">Categoría</span>
            <select
              className="field-input h-11"
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                try {
                  localStorage.setItem("orc-tests-category", e.target.value);
                } catch {
                  /* modo privado */
                }
              }}
            >
              {data.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <ul className="grid gap-3 sm:grid-cols-2">
            {TESTS.map((t) => {
              const tt = data.testTypes.find((x) => x.code === t.code);
              const excl = (data.exclusions ?? []).find((e) => e.category_id === categoryId && e.test_type_id === tt?.id);
              const off = "weekly" in t && t.weekly && !weeklyOk;
              const reason = excl ? `No corresponde a ${category?.name}: ${excl.reason}.` : off ? `No está habilitado en ${category?.name ?? "esta categoría"}.` : null;
              return (
                <li key={t.href}>
                  {reason ? (
                    <div className="card h-full opacity-70" aria-disabled>
                      <p className="font-bold">
                        <span aria-hidden>{t.icon} </span>
                        {t.title}
                      </p>
                      <p className="mt-1 text-sm">
                        <span aria-hidden>🚫 </span>
                        {reason}
                      </p>
                    </div>
                  ) : (
                    <Link href={`${t.href}?categoria=${categoryId}`} className="card block h-full transition hover:border-orc-orange">
                      <p className="font-bold">
                        <span aria-hidden>{t.icon} </span>
                        {t.title}
                      </p>
                      <p className="mt-1 text-sm text-orc-muted">{t.desc}</p>
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-orc-muted">
            Cada intento guarda cómo se midió (método, versión del protocolo, quién y con qué celular). Los intentos no se editan: para corregir, se anulan con
            un motivo y se carga otro.
          </p>
        </>
      )}
    </div>
  );
}
