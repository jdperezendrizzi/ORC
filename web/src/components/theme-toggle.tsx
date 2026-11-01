"use client";

import { useEffect, useState } from "react";

export type ThemeChoice = "system" | "light" | "dark";
export const THEME_KEY = "orc-theme";

/** Script que corre antes de pintar: aplica el tema guardado sin parpadeo. */
export const themeInitScript = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;}catch(e){}`;

function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") delete root.dataset.theme;
  else root.dataset.theme = choice;
  try {
    if (choice === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    /* sin almacenamiento: vale sólo para esta visita */
  }
}

const OPTIONS: { value: ThemeChoice; label: string; icon: React.ReactNode }[] = [
  {
    value: "system",
    label: "Tema del sistema",
    icon: (
      <>
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8M12 16v4" />
      </>
    ),
  },
  {
    value: "light",
    label: "Tema claro",
    icon: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>
    ),
  },
  {
    value: "dark",
    label: "Tema oscuro",
    icon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  },
];

/** Selector Sistema / Claro / Oscuro (header, siempre sobre fondo negro). */
export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>("system");

  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    setChoice(t === "light" || t === "dark" ? t : "system");
  }, []);

  return (
    <div role="group" aria-label="Tema" className="flex shrink-0 items-center rounded-full bg-white/10 p-0.5">
      {OPTIONS.map((o) => {
        const active = choice === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-label={o.label}
            aria-pressed={active}
            title={o.label}
            onClick={() => {
              setChoice(o.value);
              apply(o.value);
            }}
            className={`grid size-7 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-orc-orange ${
              active ? "bg-orc-orange text-orc-black" : "text-white/75 hover:text-white"
            }`}
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {o.icon}
            </svg>
          </button>
        );
      })}
    </div>
  );
}
