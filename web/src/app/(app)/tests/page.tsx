import type { Metadata } from "next";
import { Suspense } from "react";
import { FieldTestsHub } from "@/components/field-tests/hub";

export const metadata: Metadata = { title: "Tests de cancha" };

// Página 100% cliente: funciona sin señal.
export default function Page() {
  return (
    <Suspense>
      <FieldTestsHub />
    </Suspense>
  );
}
