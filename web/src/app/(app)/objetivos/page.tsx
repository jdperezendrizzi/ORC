import { redirect } from "next/navigation";

// Los objetivos están en Asistencia (pestaña Objetivos).
export default async function ObjectivesPage({ searchParams }: { searchParams: Promise<{ categoria?: string }> }) {
  const { categoria } = await searchParams;
  redirect(`/practica?tab=objetivos${categoria ? `&categoria=${categoria}` : ""}`);
}
