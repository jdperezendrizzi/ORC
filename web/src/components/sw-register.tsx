"use client";

import { useEffect } from "react";

/** Registra el service worker (sólo en producción: en dev interfiere con HMR). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      /* sin SW la app funciona igual, sólo sin modo offline de navegación */
    });
  }, []);
  return null;
}
