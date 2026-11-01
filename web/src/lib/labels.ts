// Etiquetas en castellano para enums de la base.

export const injuryStatusLabel: Record<string, string> = {
  active: "Lesionado",
  rehab: "En rehabilitación",
  return_to_play: "Regreso progresivo",
  closed: "Alta",
};

export const injuryStatusTone: Record<string, string> = {
  active: "tone-red",
  rehab: "tone-amber",
  return_to_play: "tone-sky",
  closed: "tone-green",
};

export const bodyRegionLabel: Record<string, string> = {
  head: "Cabeza",
  neck: "Cuello",
  shoulder: "Hombro",
  upper_arm: "Brazo",
  elbow: "Codo",
  forearm: "Antebrazo",
  wrist_hand: "Muñeca/mano",
  chest: "Tórax",
  thoracic_spine: "Columna dorsal",
  lumbar_spine: "Columna lumbar",
  abdomen: "Abdomen",
  hip_groin: "Cadera/ingle",
  thigh_anterior: "Muslo anterior",
  thigh_posterior: "Isquiotibiales",
  knee: "Rodilla",
  lower_leg: "Pierna",
  ankle: "Tobillo",
  foot: "Pie",
  other: "Otra",
};

export const injuryTypeLabel: Record<string, string> = {
  concussion: "Conmoción",
  muscle: "Muscular",
  ligament: "Ligamentaria",
  tendon: "Tendinosa",
  fracture: "Fractura",
  dislocation: "Luxación",
  contusion: "Contusión",
  laceration: "Corte",
  joint_cartilage: "Articular/cartílago",
  other: "Otra",
};

export const sessionTypeLabel: Record<string, string> = {
  testing: "Testeo",
  match: "Partido",
  training: "Entrenamiento",
};

export const domainLabel: Record<string, string> = {
  anthropometry: "Antropometría",
  strength: "Fuerza",
  speed: "Velocidad",
  power: "Potencia y reacción",
  agility: "Agilidad",
  endurance: "Resistencia",
  rugby: "Rugby",
};

export const maturityLabel: Record<string, string> = {
  pre_phv: "Pre-PHV",
  circa_phv: "Circa-PHV (pico de crecimiento)",
  post_phv: "Post-PHV",
};

export const unitLabel: Record<string, string> = { forwards: "Forwards", backs: "Backs" };

export const lineLabel: Record<string, string> = {
  front_row: "Primera línea",
  second_row: "Segunda línea",
  back_row: "Tercera línea",
  halves: "Medios",
  centres: "Centros",
  back_three: "Back 3",
};

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) {
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("es-AR", opts);
}
