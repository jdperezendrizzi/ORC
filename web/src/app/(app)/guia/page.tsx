import type { Metadata } from "next";
import { CONCEPTS, DOMAIN_INFO, METRIC_INFO, TEST_INFO } from "@/lib/glossary";
import { domainLabel } from "@/lib/labels";

export const metadata: Metadata = { title: "Guía de datos" };

// Estructura de la guía: área → test → métricas que se ven en la app.
// (Las cargas/repeticiones de fuerza se explican dentro del 1RM.)
const GUIDE: { domain: string; tests: { code: string; name: string; metrics: string[] }[] }[] = [
  {
    domain: "anthropometry",
    tests: [
      { code: "anthropometry", name: "Antropometría", metrics: ["height_cm", "sitting_height_cm", "weight_kg", "body_fat_pct", "skinfold_sum_mm"] },
    ],
  },
  {
    domain: "strength",
    tests: [
      { code: "back_squat", name: "Sentadilla trasera", metrics: ["back_squat_1rm_kg"] },
      { code: "bench_press", name: "Press de banca", metrics: ["bench_press_1rm_kg"] },
      { code: "deadlift", name: "Peso muerto", metrics: ["deadlift_1rm_kg"] },
      { code: "pull_ups", name: "Dominadas", metrics: ["pull_ups_reps"] },
      { code: "grip_strength", name: "Fuerza de agarre", metrics: ["grip_right_kg"] },
    ],
  },
  { domain: "speed", tests: [{ code: "sprint_40", name: "Sprint 10/20/40 m", metrics: ["sprint_10m_s", "sprint_20m_s", "sprint_40m_s"] }] },
  {
    domain: "power",
    tests: [
      { code: "cmj", name: "Salto con contramovimiento (CMJ)", metrics: ["cmj_height_cm"] },
      { code: "reaction", name: "Test de reacción", metrics: ["reaction_time_ms"] },
    ],
  },
  {
    domain: "agility",
    tests: [
      { code: "agility_505", name: "Agilidad 505", metrics: ["agility_505_left_s"] },
      { code: "t_test", name: "T-Test", metrics: ["t_test_s"] },
    ],
  },
  {
    domain: "endurance",
    tests: [
      { code: "yoyo_ir1", name: "Yo-Yo IR1", metrics: ["yoyo_ir1_distance_m", "yoyo_ir1_vo2max"] },
      { code: "ift_30_15", name: "30-15 IFT", metrics: ["ift_vift_kmh"] },
    ],
  },
  {
    domain: "rugby",
    tests: [
      { code: "match_stats", name: "Estadísticas de partido", metrics: ["minutes_played", "tackles_made", "tackles_missed", "ruck_arrivals", "carries", "turnovers_won"] },
      { code: "gps_load", name: "Carga GPS", metrics: ["gps_total_distance_m", "gps_hsr_m", "gps_max_speed_kmh", "gps_sprints", "gps_player_load"] },
    ],
  },
];

const METRIC_NAME: Record<string, string> = {
  height_cm: "Talla",
  sitting_height_cm: "Talla sentada",
  weight_kg: "Peso",
  body_fat_pct: "% graso",
  skinfold_sum_mm: "Sumatoria de pliegues",
  back_squat_1rm_kg: "Sentadilla · 1RM",
  bench_press_1rm_kg: "Press banca · 1RM",
  deadlift_1rm_kg: "Peso muerto · 1RM",
  pull_ups_reps: "Dominadas",
  grip_right_kg: "Agarre (cada mano)",
  sprint_10m_s: "Sprint 10 m",
  sprint_20m_s: "Sprint 20 m",
  sprint_40m_s: "Sprint 40 m",
  cmj_height_cm: "CMJ altura",
  reaction_time_ms: "Tiempo de reacción",
  agility_505_left_s: "505 (izquierda y derecha)",
  t_test_s: "T-Test",
  yoyo_ir1_distance_m: "Yo-Yo IR1 distancia",
  yoyo_ir1_vo2max: "VO₂máx estimado",
  ift_vift_kmh: "VIFT",
  minutes_played: "Minutos jugados",
  tackles_made: "Tackles efectivos",
  tackles_missed: "Tackles errados",
  ruck_arrivals: "Llegadas a ruck",
  carries: "Portaciones",
  turnovers_won: "Pelotas recuperadas",
  gps_total_distance_m: "Distancia total",
  gps_hsr_m: "Distancia a alta velocidad",
  gps_max_speed_kmh: "Velocidad máxima",
  gps_sprints: "Sprints",
  gps_player_load: "Player load",
};

function Concept({ c }: { c: { title: string; what: string; read?: string } }) {
  return (
    <div className="card space-y-1">
      <h3 className="font-bold">{c.title}</h3>
      <p className="text-sm">{c.what}</p>
      {c.read && <p className="text-sm text-orc-muted">{c.read}</p>}
    </div>
  );
}

export default function GuidePage() {
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <a href="/" className="text-sm text-orc-muted">
          ← Inicio
        </a>
        <h1 className="text-2xl font-black">¿Qué medimos y para qué?</h1>
        <p className="max-w-2xl text-orc-muted">
          Cada test mide una capacidad que importa en el rugby. La idea no es buscar números altos en sí, sino ver cómo
          evoluciona cada jugador y compararlo de forma justa con su categoría y con los de su línea.
        </p>
        <nav aria-label="Secciones" className="flex flex-wrap gap-2 pt-2">
          {[
            ["como-leer", "Cómo leer los datos"],
            ...GUIDE.map((g) => [g.domain, domainLabel[g.domain]]),
            ["bienestar", "Bienestar y carga"],
            ["maduracion", "Maduración"],
          ].map(([id, label]) => (
            <a key={id} href={`#${id}`} className="chip h-8 bg-orc-chip px-3 text-sm text-orc-ink ring-1 ring-orc-line hover:ring-orc-orange">
              {label}
            </a>
          ))}
        </nav>
      </header>

      <section id="como-leer" className="scroll-mt-20 space-y-3">
        <h2 className="text-lg font-black">Cómo leer los datos</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <Concept c={CONCEPTS.delta} />
          <Concept c={CONCEPTS.zscore} />
          <Concept c={CONCEPTS.groups} />
          <Concept c={CONCEPTS.evolution} />
          <Concept c={CONCEPTS.relative} />
          <Concept c={CONCEPTS.consents} />
          <Concept c={CONCEPTS.sync} />
        </div>
      </section>

      {GUIDE.map((g) => (
        <section key={g.domain} id={g.domain} className="scroll-mt-20 space-y-3">
          <div>
            <h2 className="text-lg font-black">{domainLabel[g.domain]}</h2>
            <p className="text-orc-muted">{DOMAIN_INFO[g.domain]}</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {g.tests.map((t) => (
              <article key={t.code} className="card space-y-3">
                <div>
                  <h3 className="font-bold">{t.name}</h3>
                  <p className="text-sm text-orc-muted">{TEST_INFO[t.code]}</p>
                </div>
                <dl className="space-y-2">
                  {t.metrics.map((code) => {
                    const info = METRIC_INFO[code];
                    return (
                      <div key={code} className="border-l-2 border-orc-orange pl-3 text-sm">
                        <dt className="font-semibold">{METRIC_NAME[code] ?? code}</dt>
                        <dd>{info?.what}</dd>
                        {info?.read && <dd className="text-orc-muted">{info.read}</dd>}
                      </div>
                    );
                  })}
                </dl>
              </article>
            ))}
          </div>
        </section>
      ))}

      <section id="bienestar" className="scroll-mt-20 space-y-3">
        <h2 className="text-lg font-black">Bienestar y carga</h2>
        <p className="text-orc-muted">
          Lo que se registra día a día para saber cómo llega cada jugador y si la carga de entrenamiento sube de golpe.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <Concept c={CONCEPTS.wellness} />
          <Concept c={CONCEPTS.rpe} />
          <Concept c={CONCEPTS.acwr} />
        </div>
      </section>

      <section id="maduracion" className="scroll-mt-20 space-y-3">
        <h2 className="text-lg font-black">Maduración</h2>
        <Concept c={CONCEPTS.maturation} />
      </section>
    </div>
  );
}
