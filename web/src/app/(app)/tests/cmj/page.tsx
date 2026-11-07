import type { Metadata } from "next";
import { Suspense } from "react";
import { CmjScreen } from "@/components/field-tests/cmj-screen";

export const metadata: Metadata = { title: "CMJ" };

// Página 100% cliente: funciona sin señal.
export default function Page() {
  return (
    <Suspense>
      <CmjScreen />
    </Suspense>
  );
}
