import type { Metadata } from "next";
import { SetPasswordForm } from "./set-password-form";

export const metadata: Metadata = { title: "Crear contraseña" };

// Destino de los links de invitación y de "olvidé mi contraseña".
export default function SetPasswordPage() {
  return (
    <main className="flex min-h-dvh flex-col bg-orc-black text-white">
      <div className="h-1 bg-orc-orange" aria-hidden />
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/crest.png" alt="Escudo ORC" width={250} height={278} className="mx-auto h-[110px] w-auto" />
        <h1 className="mt-6 text-center text-2xl font-black">Elegí tu contraseña</h1>
        <SetPasswordForm />
      </div>
    </main>
  );
}
