"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

type Phase = "checking" | "ready" | "invalid" | "saving" | "done";

export function SetPasswordForm() {
  const [phase, setPhase] = useState<Phase>("checking");
  const [error, setError] = useState<string | null>(null);

  // El link del email trae la sesión en el hash (#access_token=…) o un ?code=…
  useEffect(() => {
    const supabase = supabaseBrowser();
    (async () => {
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const code = new URLSearchParams(window.location.search).get("code");
      try {
        if (hash.get("access_token") && hash.get("refresh_token")) {
          const { error } = await supabase.auth.setSession({
            access_token: hash.get("access_token")!,
            refresh_token: hash.get("refresh_token")!,
          });
          if (error) throw error;
          history.replaceState(null, "", window.location.pathname);
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          history.replaceState(null, "", window.location.pathname);
        }
        const { data } = await supabase.auth.getUser();
        setPhase(data.user ? "ready" : "invalid");
      } catch {
        setPhase("invalid");
      }
    })();
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const password = String(f.get("password"));
    if (password.length < 8) return setError("Usá al menos 8 caracteres.");
    if (password !== String(f.get("confirm"))) return setError("Las contraseñas no coinciden.");
    setError(null);
    setPhase("saving");
    const { error } = await supabaseBrowser().auth.updateUser({ password });
    if (error) {
      setPhase("ready");
      setError(/weak|pwned|leaked/i.test(error.message) ? "Esa contraseña es muy débil o apareció en filtraciones. Elegí otra." : error.message);
      return;
    }
    setPhase("done");
    setTimeout(() => (window.location.href = "/"), 1200);
  }

  if (phase === "checking") return <p className="mt-6 text-center text-white/70">Verificando el link…</p>;
  if (phase === "invalid") {
    return (
      <div className="mt-6 space-y-3 text-center">
        <p className="text-white/80">El link venció o ya se usó. Pedile al admin que te reenvíe la invitación, o pedí uno nuevo:</p>
        <a href="/login" className="btn-primary w-full">
          Ir al ingreso
        </a>
      </div>
    );
  }
  if (phase === "done") return <p className="mt-6 text-center font-semibold text-orc-orange">¡Listo! Entrando…</p>;

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium text-white/70">
          Nueva contraseña
        </label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} className="field-input" />
      </div>
      <div>
        <label htmlFor="confirm" className="mb-1 block text-sm font-medium text-white/70">
          Repetila
        </label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} className="field-input" />
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-red-600/20 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}
      <button type="submit" disabled={phase === "saving"} className="btn-primary w-full">
        {phase === "saving" ? "Guardando…" : "Guardar y entrar"}
      </button>
    </form>
  );
}
