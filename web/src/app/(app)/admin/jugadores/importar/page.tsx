import type { Metadata } from "next";
import Link from "next/link";
import { loadCatalog, requireAdmin } from "@/lib/admin";
import { clubToday } from "@/lib/validation";
import type { ExistingPlayer } from "@/lib/import/roster";
import { ImportScreen } from "./import-screen";

export const metadata: Metadata = { title: "Importar plantel" };
export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const { supabase, season } = await requireAdmin();
  const { categories, positions } = await loadCatalog();
  const [players, priv] = await Promise.all([
    supabase.from("players").select("id, first_name, last_name, birth_date").is("deleted_at", null),
    supabase.from("player_private").select("player_id, document_id"),
  ]);
  const docOf = new Map((priv.data ?? []).map((p) => [p.player_id as string, (p.document_id as string | null) ?? null]));
  const existing: ExistingPlayer[] = (players.data ?? []).map((p) => ({
    id: p.id as string,
    first_name: p.first_name as string,
    last_name: p.last_name as string,
    birth_date: p.birth_date as string,
    document_id: docOf.get(p.id as string) ?? null,
  }));

  return (
    <div className="space-y-4">
      <Link href="/admin/jugadores" className="text-sm text-orc-muted">
        ← Jugadores
      </Link>
      {!season ? (
        <p className="card">Primero creá la temporada actual en la pestaña Temporada.</p>
      ) : (
        <ImportScreen
          seasonName={season.name}
          today={clubToday()}
          categories={categories.map(({ id, code, name }) => ({ id, code, name }))}
          positions={positions.map(({ id, name, short_name }) => ({ id, name, short_name }))}
          existing={existing}
        />
      )}
    </div>
  );
}
