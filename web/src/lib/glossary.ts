// Explicaciones en lenguaje simple de lo que se mide y de cómo leerlo.
// Una sola fuente para los ⓘ de la app y la página /guia.

export interface InfoText {
  /** Qué mide, en una o dos frases. */
  what: string;
  /** Cómo leer el valor (qué es mejor, a qué prestar atención). */
  read?: string;
}

/** Por métrica (código de test_metrics). */
export const METRIC_INFO: Record<string, InfoText> = {
  // Antropometría
  height_cm: {
    what: "Estatura de pie, descalzo.",
    read: "En inferiores sirve para seguir el crecimiento: un aumento rápido entre testeos indica que el jugador está en pleno estirón.",
  },
  sitting_height_cm: {
    what: "Altura sentado (tronco y cabeza).",
    read: "No se compara: junto con la talla y el peso se usa para estimar la maduración.",
  },
  weight_kg: {
    what: "Peso corporal.",
    read: "Depende mucho del puesto. También se usa para calcular la fuerza relativa (cuánto levanta por cada kilo de peso).",
  },
  body_fat_pct: {
    what: "Porcentaje del peso que es grasa.",
    read: "En general menos es mejor, pero en algunos puestos (por ejemplo pilares) es normal un valor más alto. Comparar siempre con el mismo método de medición.",
  },
  skinfold_sum_mm: {
    what: "Suma de pliegues de piel medidos con plicómetro.",
    read: "Indicador de grasa corporal sin fórmulas: si baja, el jugador perdió grasa.",
  },
  maturity_offset: {
    what: "Años antes (−) o después (+) del pico de crecimiento.",
    read: "Lo calcula la app. Ver «Maduración».",
  },

  // Fuerza
  back_squat_1rm_kg: {
    what: "Fuerza máxima de piernas: el peso más alto que podría levantar una sola vez en sentadilla (1RM).",
    read: "Más es mejor. Si se hicieron varias repeticiones con menos peso, la app estima el 1RM (fórmula de Epley). Base para empujar en scrum, ruck y contacto.",
  },
  back_squat_load_kg: { what: "Peso de la barra usado en la serie de sentadilla." },
  back_squat_reps: { what: "Repeticiones hechas con ese peso. Con la carga, permiten estimar el 1RM." },
  bench_press_1rm_kg: {
    what: "Fuerza máxima de empuje del tren superior (press de banca, 1RM).",
    read: "Más es mejor. Relacionada con el hand-off y el contacto.",
  },
  bench_press_load_kg: { what: "Peso de la barra usado en la serie de press." },
  bench_press_reps: { what: "Repeticiones hechas con ese peso." },
  deadlift_1rm_kg: {
    what: "Fuerza máxima de la cadena posterior: espalda, glúteos e isquiotibiales (peso muerto, 1RM).",
    read: "Más es mejor. Importante para levantar, empujar y prevenir lesiones de isquiotibiales.",
  },
  deadlift_load_kg: { what: "Peso de la barra usado en la serie de peso muerto." },
  deadlift_reps: { what: "Repeticiones hechas con ese peso." },
  pull_ups_reps: {
    what: "Máximas dominadas seguidas: fuerza de tracción del tren superior en relación al propio peso.",
    read: "Más es mejor. Útil en el agarre, el maul y la disputa de la pelota.",
  },
  grip_left_kg: {
    what: "Fuerza de agarre de la mano izquierda, medida con dinamómetro.",
    read: "Más es mejor. Una diferencia grande entre manos puede indicar una molestia o lesión.",
  },
  grip_right_kg: {
    what: "Fuerza de agarre de la mano derecha, medida con dinamómetro.",
    read: "Más es mejor. Una diferencia grande entre manos puede indicar una molestia o lesión.",
  },

  // Velocidad
  sprint_10m_s: {
    what: "Tiempo en los primeros 10 metros: capacidad de aceleración (arranque).",
    read: "Menos es mejor. Es la más importante en rugby: la mayoría de los esfuerzos del partido son cortos.",
  },
  sprint_20m_s: {
    what: "Tiempo hasta los 20 metros: aceleración sostenida.",
    read: "Menos es mejor.",
  },
  sprint_40m_s: {
    what: "Tiempo hasta los 40 metros: refleja la velocidad máxima.",
    read: "Menos es mejor. Clave en wings y fullbacks.",
  },

  // Potencia y reacción
  cmj_height_cm: {
    what: "Altura del salto vertical con contramovimiento: potencia de piernas (generar fuerza rápido).",
    read: "Más es mejor. Si baja claramente respecto de lo habitual del jugador, puede indicar fatiga.",
  },
  reaction_time_ms: {
    what: "Tiempo en responder a un estímulo visual (luz o señal), en milésimas de segundo.",
    read: "Menos es mejor.",
  },

  // Agilidad
  agility_505_left_s: {
    what: "Test 505 girando sobre la pierna izquierda: frenar, girar 180° y volver a acelerar.",
    read: "Menos es mejor. Comparar con el lado derecho: una diferencia grande muestra un lado más débil.",
  },
  agility_505_right_s: {
    what: "Test 505 girando sobre la pierna derecha: frenar, girar 180° y volver a acelerar.",
    read: "Menos es mejor. Comparar con el lado izquierdo para detectar asimetrías.",
  },
  t_test_s: {
    what: "Recorrido en T con desplazamientos de frente, laterales y hacia atrás: agilidad general.",
    read: "Menos es mejor.",
  },

  // Resistencia
  yoyo_ir1_level: {
    what: "Nivel alcanzado en el Yo-Yo IR1 (por ejemplo 17.4).",
    read: "Más es mejor. Es otra forma de expresar la distancia.",
  },
  yoyo_ir1_distance_m: {
    what: "Metros recorridos en el Yo-Yo IR1: capacidad de repetir esfuerzos intensos con poca recuperación, como pide un partido.",
    read: "Más es mejor.",
  },
  yoyo_ir1_vo2max: {
    what: "Estimación de la capacidad aeróbica (consumo máximo de oxígeno) a partir del Yo-Yo.",
    read: "Más es mejor. La calcula la app; es una estimación, no una medición de laboratorio.",
  },
  ift_vift_kmh: {
    what: "Velocidad final alcanzada en el test 30-15 IFT.",
    read: "Más es mejor. También sirve para programar pasadas de entrenamiento a un % de esa velocidad.",
  },

  // Rugby (partido)
  minutes_played: { what: "Minutos jugados en el partido.", read: "Da contexto al resto: más minutos, más acciones." },
  tackles_made: { what: "Tackles completados con éxito.", read: "Más es mejor. Leer junto con los minutos jugados." },
  tackles_missed: { what: "Tackles errados.", read: "Menos es mejor." },
  ruck_arrivals: { what: "Llegadas a un ruck para limpiar o asegurar la pelota.", read: "Más es mejor; es trabajo típico de forwards." },
  carries: { what: "Veces que el jugador llevó la pelota contra la defensa.", read: "Más es mejor." },
  turnovers_won: { what: "Pelotas recuperadas al rival.", read: "Más es mejor." },

  // GPS
  gps_total_distance_m: { what: "Distancia total recorrida en la sesión o partido, medida por GPS." },
  gps_hsr_m: {
    what: "Metros recorridos a alta velocidad (más de 19,8 km/h).",
    read: "Indica cuánto trabajo intenso hizo. Subas bruscas de una semana a otra aumentan el riesgo de lesión muscular.",
  },
  gps_max_speed_kmh: { what: "Velocidad máxima alcanzada.", read: "Más es mejor. Útil para saber si el jugador llega a su velocidad tope." },
  gps_sprints: { what: "Cantidad de sprints (esfuerzos a muy alta velocidad)." },
  gps_player_load: {
    what: "Carga mecánica acumulada (aceleraciones, frenadas, choques) medida por el acelerómetro del GPS.",
    read: "En unidades arbitrarias: sirve para comparar sesiones del mismo jugador, no entre marcas de GPS.",
  },
};

/** Qué mide cada test (para elegir qué cargar). */
export const TEST_INFO: Record<string, string> = {
  anthropometry: "Talla, peso, grasa y maduración.",
  back_squat: "Fuerza máxima de piernas.",
  bench_press: "Fuerza máxima de empuje del tren superior.",
  deadlift: "Fuerza máxima de espalda, glúteos e isquiotibiales.",
  pull_ups: "Fuerza de tracción con el propio peso.",
  grip_strength: "Fuerza de agarre de cada mano.",
  sprint_40: "Aceleración (10 m) y velocidad máxima (40 m).",
  cmj: "Potencia de piernas con un salto.",
  reaction: "Rapidez de respuesta a un estímulo.",
  agility_505: "Frenar, girar 180° y acelerar, cada lado.",
  t_test: "Agilidad con desplazamientos en todas las direcciones.",
  yoyo_ir1: "Resistencia para repetir esfuerzos intensos.",
  ift_30_15: "Resistencia intermitente y velocidad aeróbica.",
  match_stats: "Minutos y acciones de juego del partido.",
  gps_load: "Distancias, velocidad y carga medidas por GPS.",
};

/** Qué agrupa cada área. */
export const DOMAIN_INFO: Record<string, string> = {
  anthropometry: "Cuerpo y crecimiento: talla, peso, composición y maduración.",
  strength: "Cuánta fuerza puede hacer el jugador (máxima y con su propio peso).",
  speed: "Qué tan rápido acelera y qué velocidad máxima alcanza.",
  power: "Capacidad de hacer fuerza rápido (saltar, reaccionar).",
  agility: "Capacidad de frenar y cambiar de dirección.",
  endurance: "Capacidad de sostener y repetir esfuerzos durante el partido.",
  rugby: "Lo que hizo en el partido: minutos, acciones y carga GPS.",
};

/** Conceptos que aparecen en el perfil y en las pantallas de carga. */
export const CONCEPTS = {
  zscore: {
    title: "Comparación en DE (desvíos estándar)",
    what: "Muestra qué tan lejos está el jugador del promedio de su grupo en la temporada. 0 = justo en el promedio. +1 DE = claramente mejor (más o menos mejor que 8 de cada 10). −1 DE = claramente peor.",
    read: "Siempre positivo = mejor, aunque en la métrica menos sea mejor (como el sprint). Se calcula sólo si hay al menos 3 jugadores medidos en el grupo.",
  },
  groups: {
    title: "Categoría y línea",
    what: "«vs. categoría» compara contra todos los jugadores de su categoría. «vs. su línea» compara sólo con los de su línea (primera línea, segunda, tercera, medios, centros o back 3), que tienen demandas parecidas.",
    read: "Un pilar puede estar por debajo de la categoría en sprint y bien dentro de su línea: eso es lo esperable.",
  },
  delta: {
    title: "Flechas ▲ ▼",
    what: "Cambio respecto de la medición anterior del mismo jugador.",
    read: "Verde = mejoró, rojo = empeoró. En sprint y agilidad un ▼ en verde es bueno: bajó el tiempo.",
  },
  evolution: {
    title: "Gráfico de evolución",
    what: "Línea naranja: los valores del jugador en cada testeo. Línea negra punteada: promedio de su categoría. Línea gris punteada: promedio de su línea.",
    read: "En métricas donde menos es mejor (sprint, agilidad) el eje está invertido: arriba siempre es mejor.",
  },
  relative: {
    title: "Fuerza relativa",
    what: "Kilos levantados dividido el peso corporal (por ejemplo 1,5 × = levanta una vez y media su peso).",
    read: "Permite comparar jugadores de distinto tamaño. En inferiores importa más que la fuerza absoluta.",
  },
  maturation: {
    title: "Maduración (PHV)",
    what: "El PHV es el momento del estirón de crecimiento más fuerte (en varones, en general entre los 13 y 15 años). Se estima con la fórmula de Mirwald a partir de edad, talla, talla sentada y peso.",
    read: "Pre-PHV: todavía no llegó. Circa-PHV: está en el estirón; más riesgo de lesiones por sobrecarga y puede perder coordinación por un tiempo. Post-PHV: ya pasó. Sirve para no comparar injustamente a chicos de la misma edad que maduran en distinto momento. Es una estimación (±1 año).",
  },
  acwr: {
    title: "ACWR (carga aguda : crónica)",
    what: "Compara la carga de los últimos 7 días con el promedio de las últimas 4 semanas.",
    read: "Entre 0,8 y 1,3 es la zona segura. Arriba de 1,5 hubo un salto brusco de carga, asociado a más riesgo de lesión. Abajo de 0,8 está entrenando menos de lo habitual.",
  },
  rpe: {
    title: "RPE y carga de la sesión",
    what: "RPE: qué tan dura sintió el jugador la sesión, de 0 (reposo) a 10 (esfuerzo máximo). Se pregunta unos 30 minutos después de terminar.",
    read: "Carga = RPE × minutos (por ejemplo 6 × 80 min = 480). Con la carga diaria se calcula el ACWR.",
  },
  wellness: {
    title: "Bienestar (wellness)",
    what: "Cinco preguntas de 1 a 5 sobre cómo llega el jugador: calidad de sueño, fatiga, dolor muscular, estrés y ánimo. 5 siempre es el mejor estado. La suma va de 5 a 25.",
    read: "Por debajo de 15, o una caída fuerte respecto de lo habitual del jugador, conviene hablar con él y quizás ajustar el entrenamiento.",
  },
  consents: {
    title: "Consentimientos",
    what: "Autorizaciones firmadas por el tutor (o por el jugador si es mayor) para registrar cada tipo de dato.",
    read: "✕ en amarillo = falta esa autorización: la app no deja cargar ese tipo de dato hasta que el admin la registre.",
  },
  sync: {
    title: "Puntos de color al cargar",
    what: "Verde: el dato ya está guardado en el servidor. Naranja: guardado en el celular, se sube cuando haya señal. Rojo: hubo un problema (el motivo aparece debajo).",
  },
} satisfies Record<string, InfoText & { title: string }>;
