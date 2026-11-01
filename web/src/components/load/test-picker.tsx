"use client";

import type { FieldData } from "@/lib/offline/field-data";
import { domainLabel } from "@/lib/labels";
import type { EvaluationSession, TestType } from "@/lib/types";

/** Tests agrupados por dominio. En partidos, primero los de rugby. */
export function TestPicker({
  data,
  session,
  onSelect,
}: {
  data: FieldData;
  session: EvaluationSession;
  onSelect: (testTypeId: string) => void;
}) {
  const groups = new Map<string, TestType[]>();
  for (const t of data.testTypes) groups.set(t.domain, [...(groups.get(t.domain) ?? []), t]);
  const order = [...groups.keys()].sort((a, b) => {
    if (session.session_type === "match") return (a === "rugby" ? -1 : 0) - (b === "rugby" ? -1 : 0);
    return 0;
  });

  return (
    <div className="space-y-4">
      {order.map((domain) => (
        <section key={domain}>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-orc-muted">{domainLabel[domain] ?? domain}</h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {groups.get(domain)!.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => onSelect(t.id)}
                  className="card flex h-full w-full flex-col items-start p-3 text-left hover:border-orc-orange"
                >
                  <span className="font-semibold">{t.name}</span>
                  <span className="mt-1 text-xs text-orc-muted">
                    {data.metrics
                      .filter((m) => m.test_type_id === t.id && !m.derivation)
                      .map((m) => m.unit)
                      .filter((u, i, a) => a.indexOf(u) === i)
                      .join(" · ")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
