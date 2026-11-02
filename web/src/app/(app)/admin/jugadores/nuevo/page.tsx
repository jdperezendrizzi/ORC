import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { loadCatalog, requireAdmin } from "@/lib/admin";
import { createPlayer } from "../../actions";
import { PlayerFields } from "../player-fields";

export const dynamic = "force-dynamic";

export default async function NewPlayer() {
  const { season } = await requireAdmin();
  const { categories, positions } = await loadCatalog();
  return (
    <div className="space-y-4">
      <Link href="/admin/jugadores" className="text-sm text-orc-muted">
        ← Jugadores
      </Link>
      <section className="card space-y-4">
        <div>
          <h2 className="text-lg font-bold">Nuevo jugador</h2>
          <p className="text-sm text-orc-muted">
            Después de crearlo vas a poder cargar sus tutores y consentimientos. Sin consentimiento, los profes no pueden
            registrarle datos.
          </p>
        </div>
        <ActionForm action={createPlayer} submitLabel="Crear jugador">
          <PlayerFields categories={categories} positions={positions} seasonName={season?.name ?? ""} />
        </ActionForm>
      </section>
    </div>
  );
}
