import type { Metadata } from "next";
import { Suspense } from "react";
import { ObjectivesScreen } from "@/components/objectives-screen";

export const metadata: Metadata = { title: "Objetivos" };

// Página 100% cliente: funciona sin señal.
export default function ObjectivesPage() {
  return (
    <Suspense>
      <ObjectivesScreen />
    </Suspense>
  );
}
