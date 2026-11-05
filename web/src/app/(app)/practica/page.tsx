import type { Metadata } from "next";
import { Suspense } from "react";
import { PracticeScreen } from "@/components/practice-screen";

export const metadata: Metadata = { title: "Práctica" };

// Página 100% cliente: funciona sin señal.
export default function PracticePage() {
  return (
    <Suspense>
      <PracticeScreen />
    </Suspense>
  );
}
