"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  async function forgot() {
    const email = (document.getElementById("email") as HTMLInputElement | null)?.value.trim();
    setError(null);
    setInfo(null);
    if (!email) return setError("Escribí tu email arriba y volvé a tocar «¿Olvidaste tu contraseña?».");
    const { error } = await supabaseBrowser().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/cuenta/clave`,
    });
    if (error && /rate limit/i.test(error.message)) return setError("Se enviaron muchos emails. Probá en un rato.");
    // Mismo mensaje exista o no la cuenta (no revelar qué emails están registrados).
    setInfo("Si el email está registrado, te llega un link para crear una contraseña nueva.");
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.signInWithPassword({
      email: String(form.get("email")).trim(),
      password: String(form.get("password")),
    });
    if (error) {
      setBusy(false);
      setError(
        error.message === "Invalid login credentials"
          ? "Email o contraseña incorrectos."
          : navigator.onLine
            ? error.message
            : "Sin conexión: para ingresar necesitás señal.",
      );
      return;
    }
    window.location.href = "/";
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4">
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-white/70">
          Email
        </label>
        <input id="email" name="email" type="email" autoComplete="email" required className="field-input text-orc-ink" />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium text-white/70">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="field-input text-orc-ink"
        />
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-red-600/20 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}
      {info && (
        <p role="status" className="rounded-lg bg-white/10 px-3 py-2 text-sm text-white/90">
          {info}
        </p>
      )}
      <button type="submit" disabled={busy} className="btn-primary w-full">
        {busy ? "Ingresando…" : "Ingresar"}
      </button>
      <button type="button" onClick={() => void forgot()} className="w-full text-center text-sm text-white/70 underline-offset-4 hover:underline">
        ¿Olvidaste tu contraseña?
      </button>
    </form>
  );
}
