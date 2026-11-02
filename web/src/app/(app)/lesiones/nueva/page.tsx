import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { InjuryForm } from "@/components/injury-form";

export const metadata: Metadata = { title: "Registrar lesión" };

// Página 100% cliente: funciona sin señal (los datos salen del celular).
export default function NewInjury() {
  return (
    <div className="space-y-4">
      <Link href="/lesiones" className="text-sm text-orc-muted">
        ← Lesiones
      </Link>
      <Suspense>
        <InjuryForm />
      </Suspense>
    </div>
  );
}
