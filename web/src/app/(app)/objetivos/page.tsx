import type { Metadata } from "next";
import { Suspense } from "react";
import { PracticeScreen } from "@/components/practice-screen";

export const metadata: Metadata = { title: "Objetivos" };

// Objetivos de la práctica (checklist). 100% cliente: funciona sin señal.
export default function ObjectivesPage() {
  return (
    <Suspense>
      <PracticeScreen only="objetivos" />
    </Suspense>
  );
}
