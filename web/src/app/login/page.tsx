import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Ingresar" };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col bg-orc-black text-white">
      <div className="h-1 bg-orc-orange" aria-hidden />
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/crest.png" alt="Escudo ORC" width={250} height={278} className="mx-auto h-[140px] w-auto" />
        <h1 className="mt-6 text-center text-2xl font-black">
          ORC <span className="text-orc-orange">Rendimiento</span>
        </h1>
        <p className="mt-1 text-center text-sm text-white/60">Datos de rendimiento · de infantiles a Primera</p>
        <LoginForm />
        <p className="mt-8 text-center text-xs text-white/40">
          Las cuentas las crea el club. Si no tenés usuario, pedíselo al administrador.
        </p>
      </div>
    </main>
  );
}
