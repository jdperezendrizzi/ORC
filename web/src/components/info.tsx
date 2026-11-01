"use client";

import { useId, useState } from "react";
import type { InfoText } from "@/lib/glossary";

/** Botón ⓘ (tamaño cómodo para el dedo). */
function InfoButton({ open, controls, label, onClick }: { open: boolean; controls: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-controls={controls}
      aria-label={open ? `Ocultar explicación de ${label}` : `Qué es ${label}`}
      title={open ? "Ocultar explicación" : "¿Qué es esto?"}
      className={`-m-1.5 inline-grid size-8 shrink-0 place-items-center rounded-full p-1.5 transition-colors ${
        open ? "text-orc-orange-strong" : "text-orc-muted hover:text-orc-ink"
      }`}
    >
      <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
        <circle cx="12" cy="12" r="9.5" />
        <path d="M12 11v6" strokeLinecap="round" />
        <circle cx="12" cy="7.6" r="0.6" fill="currentColor" />
      </svg>
    </button>
  );
}

/** Caja con la explicación. */
export function InfoBox({ info, id }: { info: InfoText; id?: string }) {
  return (
    <div id={id} className="rounded-lg border-l-4 border-orc-orange bg-orc-orange-soft px-3 py-2 text-sm leading-snug text-orc-ink">
      <p>{info.what}</p>
      {info.read && <p className="mt-1 text-orc-muted">{info.read}</p>}
    </div>
  );
}

/**
 * Encabezado con título, ⓘ y algo a la derecha (fecha, acción).
 * Al tocar ⓘ la explicación se despliega debajo, dentro del mismo bloque.
 */
export function InfoHeader({
  title,
  info,
  aside,
  className = "",
  titleClassName = "font-semibold",
}: {
  title: React.ReactNode;
  info?: InfoText;
  aside?: React.ReactNode;
  className?: string;
  titleClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const label = typeof title === "string" ? title : "este dato";
  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2">
        <span className={`flex min-w-0 items-center gap-1.5 ${titleClassName}`}>
          <span className="min-w-0">{title}</span>
          {info && <InfoButton open={open} controls={id} label={label} onClick={() => setOpen((o) => !o)} />}
        </span>
        {aside}
      </div>
      {info && open && (
        <div className="mt-2">
          <InfoBox info={info} id={id} />
        </div>
      )}
    </div>
  );
}

/** Bloque desplegable "¿Cómo leer…?" con varias explicaciones. */
export function HowToRead({
  title,
  items,
  footer,
}: {
  title: string;
  items: (InfoText & { title: string })[];
  footer?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <section className="card p-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={id}
        className="flex w-full items-center gap-2 px-4 py-3 text-left font-semibold"
      >
        <svg viewBox="0 0 24 24" className="size-5 text-orc-orange-strong" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <circle cx="12" cy="12" r="9.5" />
          <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14" strokeLinecap="round" />
          <circle cx="12" cy="17.2" r="0.6" fill="currentColor" />
        </svg>
        <span className="flex-1">{title}</span>
        <span className="text-sm text-orc-muted">{open ? "Ocultar" : "Ver"}</span>
      </button>
      {open && (
        <div id={id} className="grid gap-3 border-t border-orc-line px-4 py-4 sm:grid-cols-2">
          {items.map((it) => (
            <div key={it.title} className="text-sm leading-snug">
              <h3 className="font-semibold">{it.title}</h3>
              <p className="mt-0.5">{it.what}</p>
              {it.read && <p className="mt-1 text-orc-muted">{it.read}</p>}
            </div>
          ))}
          {footer && <div className="sm:col-span-2">{footer}</div>}
        </div>
      )}
    </section>
  );
}
