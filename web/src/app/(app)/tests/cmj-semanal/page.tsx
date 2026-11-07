import type { Metadata } from "next";
import { Suspense } from "react";
import { CmjWeeklyScreen } from "@/components/field-tests/cmj-weekly-screen";

export const metadata: Metadata = { title: "CMJ semanal" };

// Página 100% cliente: funciona sin señal.
export default function Page() {
  return (
    <Suspense>
      <CmjWeeklyScreen />
    </Suspense>
  );
}
