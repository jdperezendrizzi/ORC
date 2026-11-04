import "server-only";

import type { WeeklyFacts } from "./alerts";

// IA para redactar el resumen semanal (Groq, plan gratuito, API compatible
// con OpenAI). Sólo recibe números y códigos J1, J2… — nunca nombres.
// Sin GROQ_API_KEY, o si falla, se usa el resumen por plantilla.

// GROQ_BASE_URL sólo para pruebas (servidor falso que verifica qué se manda).
const groqUrl = () => `${process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1"}/chat/completions`;
const DEFAULT_MODEL = "llama-3.3-70b-versatile";

export const aiConfigured = () => !!process.env.GROQ_API_KEY;

const SYSTEM = `Sos el preparador físico de un club de rugby de Argentina y escribís el resumen semanal de una categoría para el cuerpo técnico.
Reglas:
- Usá SOLO los datos del JSON. No inventes números, causas, diagnósticos ni recomendaciones médicas.
- Nombrá a los jugadores únicamente con su código tal cual (J1, J2…). Nunca inventes nombres.
- Español rioplatense, claro y directo, tono de colega. Máximo 8 líneas, sin títulos ni markdown, salvo guiones para la lista de "a tener en cuenta".
- Primero cómo estuvo la semana (bienestar, carga, evaluaciones), después lo positivo (mejoras) y al final lo que hay que mirar (alertas y lesiones).
- El bienestar es un puntaje de 5 a 25 (más es mejor). La carga es RPE × minutos por sesión.
- Si no hay datos de algo, decilo en pocas palabras.`;

export async function aiWeeklySummary(facts: WeeklyFacts): Promise<{ text: string; model: string } | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  const model = process.env.GROQ_MODEL || DEFAULT_MODEL;
  try {
    const res = await fetch(groqUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_tokens: 600,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Datos de la semana (JSON):\n${JSON.stringify(facts)}` },
        ],
      }),
      signal: AbortSignal.timeout(25_000),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("IA: respuesta", res.status, (await res.text()).slice(0, 200));
      return null;
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) return null;
    return { text: text.slice(0, 3500), model };
  } catch (e) {
    console.error("IA: error", e instanceof Error ? e.message : e);
    return null;
  }
}
