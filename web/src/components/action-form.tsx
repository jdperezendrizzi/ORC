"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

export interface ActionResult {
  ok?: string;
  error?: string;
}
export type FormAction = (prev: ActionResult, formData: FormData) => Promise<ActionResult>;

/** Formulario de server action con mensaje de éxito/error y botón con estado. */
export function ActionForm({
  action,
  children,
  submitLabel,
  className = "space-y-3",
  resetOnSuccess = false,
  submitClassName = "btn-primary",
}: {
  action: FormAction;
  children: React.ReactNode;
  submitLabel: string;
  className?: string;
  resetOnSuccess?: boolean;
  submitClassName?: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <Submit label={submitLabel} className={submitClassName} />
        <Message state={state} />
      </div>
    </form>
  );
}

function Submit({ label, className }: { label: string; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? "Guardando…" : label}
    </button>
  );
}

export function Message({ state }: { state: ActionResult }) {
  if (state.error) {
    return (
      <p role="alert" className="chip tone-red px-3 py-1 text-sm">
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p role="status" className="chip tone-green px-3 py-1 text-sm">
        {state.ok}
      </p>
    );
  }
  return null;
}

/** Botón chico para acciones de una sola fila (revocar, quitar, activar). */
export function InlineAction({
  action,
  fields,
  label,
  confirmText,
  className = "text-sm font-semibold text-orc-orange-strong hover:underline",
}: {
  action: FormAction;
  fields: Record<string, string>;
  label: string;
  confirmText?: string;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form
      action={formAction}
      className="inline-flex items-center gap-2"
      onSubmit={(e) => {
        // confirm() funciona en el navegador real (no en vistas embebidas).
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
    >
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <InlineSubmit label={label} className={className} />
      {state.error && <span className="text-xs text-bad">{state.error}</span>}
    </form>
  );
}

function InlineSubmit({ label, className }: { label: string; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? "…" : label}
    </button>
  );
}
