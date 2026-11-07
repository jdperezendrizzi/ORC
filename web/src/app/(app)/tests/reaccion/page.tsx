import type { Metadata } from "next";
import { Suspense } from "react";
import { ReactionScreen } from "@/components/field-tests/reaction-screen";

export const metadata: Metadata = { title: "Reacción" };

// Página 100% cliente: funciona sin señal.
export default function Page() {
  return (
    <Suspense>
      <ReactionScreen />
    </Suspense>
  );
}
