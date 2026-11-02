export const metadata = { title: "Sin conexión" };

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-orc-black px-6 text-center text-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/crest.png" alt="" width={250} height={278} className="h-[90px] w-auto" />
      <h1 className="mt-6 text-xl font-bold">Sin conexión</h1>
      <p className="mt-2 max-w-xs text-white/70">
        Esta página necesita señal. La carga de datos, el bienestar y el registro de lesiones funcionan sin conexión y se suben solos
        cuando vuelve la señal.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <a href="/cargar" className="btn-primary">
          Cargar datos
        </a>
        <a href="/bienestar" className="btn-ghost">
          Bienestar
        </a>
        <a href="/lesiones/nueva" className="btn-ghost">
          Registrar lesión
        </a>
      </div>
    </main>
  );
}
