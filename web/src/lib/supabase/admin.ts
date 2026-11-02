import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente con la clave secreta (service role). Saltea RLS: usar SÓLO en
 * server actions que ya verificaron que quien llama es admin, y sólo para
 * lo que la API pública no permite (invitar usuarios por email).
 *
 * Requiere SUPABASE_SERVICE_ROLE_KEY en el servidor (Vercel → Environment
 * Variables). NUNCA con prefijo NEXT_PUBLIC_: no debe llegar al navegador.
 */
export function supabaseAdmin(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const canInviteByEmail = () => Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
