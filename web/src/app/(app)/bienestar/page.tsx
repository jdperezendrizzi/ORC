import type { Metadata } from "next";
import { WellnessScreen } from "@/components/wellness-screen";

export const metadata: Metadata = { title: "Bienestar" };

// Página 100% cliente: funciona sin señal.
export default function WellnessPage() {
  return <WellnessScreen />;
}
