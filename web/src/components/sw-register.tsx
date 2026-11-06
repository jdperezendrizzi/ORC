"use client";

import { useEffect } from "react";

/** Registra el service worker (sólo en producción: en dev interfiere con HMR). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    // Cuando el navegador queda libre: instalarlo en medio de la carga de
    // la página competía con React (errores de hidratación intermitentes).
    const register = () =>
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        /* sin SW la app funciona igual, sólo sin modo offline de navegación */
      });
    const hasIdle = typeof window.requestIdleCallback === "function";
    const id = hasIdle ? window.requestIdleCallback(() => void register(), { timeout: 5000 }) : setTimeout(() => void register(), 2000);
    return () => {
      if (hasIdle) window.cancelIdleCallback(id as number);
      else clearTimeout(id);
    };
  }, []);
  return null;
}
