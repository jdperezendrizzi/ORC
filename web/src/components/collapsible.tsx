"use client";

import { useState } from "react";

/**
 * Desplegable cuyo estado lo maneja el usuario. El valor inicial se respeta
 * sólo al montar: si la página se refresca tras guardar, no se cierra solo
 * (y el mensaje de éxito sigue a la vista).
 */
export function Collapsible({
  summary,
  initiallyOpen = false,
  className = "",
  children,
}: {
  summary: React.ReactNode;
  initiallyOpen?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <details
      className={className}
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer font-semibold text-orc-orange-strong">{summary}</summary>
      {children}
    </details>
  );
}
