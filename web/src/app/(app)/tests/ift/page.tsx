import type { Metadata } from "next";
import { Suspense } from "react";
import { IftScreen } from "@/components/field-tests/ift-screen";

export const metadata: Metadata = { title: "30-15 IFT" };

// Página 100% cliente: funciona sin señal.
export default function Page() {
  return (
    <Suspense>
      <IftScreen />
    </Suspense>
  );
}
