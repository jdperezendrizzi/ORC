"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const MAX_MS = 20_000; // por si la navegación se cancela (p. ej. sin señal)

/**
 * Indicador de carga global: al tocar un link interno (o enviar un filtro
 * GET) muestra una barra arriba, marca el link tocado como "cargando" e
 * ignora los toques repetidos hasta que llega la página nueva.
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const marked = useRef<Element | null>(null);

  const stop = () => {
    busy.current = false;
    setLoading(false);
    window.clearTimeout(timer.current);
    if (marked.current) {
      marked.current.removeAttribute("data-nav-loading");
      marked.current.removeAttribute("aria-busy");
      marked.current = null;
    }
  };

  // Llegó la página nueva (navegación del lado del cliente)
  useEffect(() => {
    stop();
  }, [pathname, search]);

  useEffect(() => {
    const start = (el: Element | null) => {
      busy.current = true;
      setLoading(true);
      if (el) {
        el.setAttribute("data-nav-loading", "true");
        el.setAttribute("aria-busy", "true");
        marked.current = el;
      }
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(stop, MAX_MS);
    };

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const same = url.pathname === window.location.pathname && url.search === window.location.search;
      if (same) return; // ancla o la misma página
      if (busy.current) {
        // Ya está cargando: evitar toques repetidos
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      start(a);
    };

    const onSubmit = (e: SubmitEvent) => {
      const form = e.target as HTMLFormElement;
      // Sólo formularios que navegan (filtros GET); los de acciones muestran su propio "Guardando…"
      if (e.defaultPrevented || (form.method || "get").toLowerCase() !== "get" || form.getAttribute("action")?.startsWith("javascript")) return;
      if (busy.current) {
        e.preventDefault();
        return;
      }
      start((e.submitter as Element | null) ?? null);
    };

    // Volver con el botón "atrás" desde la caché del navegador
    const onPageShow = () => stop();

    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      window.removeEventListener("pageshow", onPageShow);
      window.clearTimeout(timer.current);
    };
  }, []);

  if (!loading) return null;
  return (
    <>
      <div className="nav-progress" role="progressbar" aria-label="Cargando" aria-busy="true">
        <span />
      </div>
      {/* Cartel visible si tarda más de un instante (no parpadea en cargas rápidas) */}
      <div className="nav-progress-pill" aria-hidden>
        <span className="inline-block size-4 animate-spin rounded-full border-2 border-orc-orange border-t-transparent" />
        Cargando…
      </div>
    </>
  );
}
