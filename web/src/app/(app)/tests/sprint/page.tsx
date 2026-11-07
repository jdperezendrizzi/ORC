import type { Metadata } from "next";
import { Suspense } from "react";
import { SprintScreen } from "@/components/field-tests/sprint-screen";

export const metadata: Metadata = { title: "Sprint" };

// Página 100% cliente: funciona sin señal.
export default function Page() {
  return (
    <Suspense>
      <SprintScreen />
    </Suspense>
  );
}
