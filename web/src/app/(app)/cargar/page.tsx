import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadScreen } from "@/components/load/load-screen";

export const metadata: Metadata = { title: "Evaluaciones" };

// Página 100% cliente: lee de IndexedDB y funciona sin señal.
export default function LoadPage() {
  return (
    <Suspense>
      <LoadScreen />
    </Suspense>
  );
}
