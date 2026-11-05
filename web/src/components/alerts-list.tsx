import Link from "next/link";
import { alertKindLabel, type Alert } from "@/lib/alerts";
import { Collapsible } from "./collapsible";

const tone: Record<Alert["severity"], string> = { alta: "tone-red", media: "tone-amber" };

/** Alertas automáticas (reglas, sin IA). */
export function AlertsList({
  alerts,
  names,
  categoryNames,
  visible = 6,
}: {
  alerts: Alert[];
  names: Map<string, string>;
  categoryNames?: Map<string, string>;
  visible?: number;
}) {
  const item = (a: Alert, i: number) => (
    <li key={`${a.kind}-${a.playerId}-${i}`}>
      <Link href={a.href} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-3 hover:bg-orc-orange-soft">
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">
            {names.get(a.playerId) ?? "Jugador"}
            {categoryNames && <span className="font-normal text-orc-muted"> · {categoryNames.get(a.categoryId)}</span>}
          </span>
          <span className="block text-sm text-orc-muted">{a.detail}</span>
        </span>
        <span className={`chip shrink-0 text-xs ${tone[a.severity]}`}>{alertKindLabel[a.kind]}</span>
      </Link>
    </li>
  );
  return (
    <section aria-label="Alertas">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-orc-muted">
        Alertas {alerts.length > 0 && `(${alerts.length})`}
      </h2>
      {alerts.length === 0 ? (
        <p className="card text-sm">Sin alertas: nadie con faltas seguidas, bienestar bajo, carga en alza, caída de rendimiento ni regreso vencido.</p>
      ) : (
        <div className="card space-y-2 p-0">
          <ul className="divide-y divide-orc-line">{alerts.slice(0, visible).map(item)}</ul>
          {alerts.length > visible && (
            <Collapsible summary={`Ver ${alerts.length - visible} más`} className="px-4 pb-3">
              <ul className="mt-2 divide-y divide-orc-line rounded-lg border border-orc-line">
                {alerts.slice(visible).map((a, i) => item(a, i + visible))}
              </ul>
            </Collapsible>
          )}
          <Collapsible summary="¿Cómo se calculan?" className="px-4 pb-3 text-sm">
            <ul className="mt-2 list-disc space-y-1 pl-5 text-orc-muted">
              <li><b>Regreso vencido:</b> lesión sin alta con la fecha estimada de regreso ya pasada.</li>
              <li><b>Carga en alza:</b> la carga (RPE × minutos) de los últimos 7 días es 1,5 veces o más su promedio de las últimas 4 semanas. Los saltos bruscos de carga se asocian a más lesiones. Necesita 3 semanas de registros.</li>
              <li><b>Faltas seguidas:</b> faltó a las últimas 3 prácticas sin justificar (en las últimas 2 semanas).</li>
              <li><b>Bienestar bajo:</b> los últimos 3 registros de bienestar en 12/25 o menos.</li>
              <li><b>Bajó el rendimiento:</b> en un test físico, la última medición (de los últimos 45 días) es peor que la anterior: 3 % en tiempos (sprint, agilidad) y 5 % en el resto.</li>
            </ul>
            <p className="mt-2 text-orc-muted">Son avisos para mirar y charlar, no diagnósticos.</p>
          </Collapsible>
        </div>
      )}
    </section>
  );
}
