import { redirect } from "next/navigation";

// Los objetivos ahora están en Práctica (pestaña Objetivos).
export default async function ObjectivesPage({ searchParams }: { searchParams: Promise<{ categoria?: string }> }) {
  const { categoria } = await searchParams;
  redirect(`/practica?tab=objetivos${categoria ? `&categoria=${categoria}` : ""}`);
}
