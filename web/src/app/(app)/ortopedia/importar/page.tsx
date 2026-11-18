import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { fetchAll } from "@/lib/fetch-all";
import { currentCampaign } from "@/lib/ortho";
import type { OrthoPlayerRef } from "@/lib/import/ortho";
import { canManageInjuries, getViewer } from "@/lib/server-data";
import { clubToday } from "@/lib/validation";
import { OrthoImportScreen } from "./import-screen";

export const metadata: Metadata = { title: "Importar evaluaciones ortopédicas" };
export const dynamic = "force-dynamic";

export default async function OrthoImportPage() {
  const { supabase, profile } = await getViewer();
  if (!canManageInjuries(profile)) redirect("/ortopedia");
  const [players, priv, consents] = await Promise.all([
    fetchAll<{ id: string; first_name: string; last_name: string; birth_date: string }>(
      () => supabase.from("players").select("id, first_name, last_name, birth_date").is("deleted_at", null).order("id") as never,
    ),
    fetchAll<{ player_id: string; document_id: string | null }>(
      () => supabase.from("player_private").select("player_id, document_id").order("player_id") as never,
    ),
    fetchAll<{ player_id: string }>(
      () => supabase.from("consents").select("player_id").eq("consent_type", "medical_data").is("revoked_at", null).order("id") as never,
    ),
  ]);
  const docOf = new Map(priv.map((p) => [p.player_id, p.document_id]));
  const withConsent = new Set(consents.map((c) => c.player_id));
  const refs: OrthoPlayerRef[] = players.map((p) => ({
    ...p,
    document_id: docOf.get(p.id) ?? null,
    has_medical_consent: withConsent.has(p.id),
  }));

  return (
    <div className="space-y-4">
      <Link href="/ortopedia" className="text-sm text-orc-muted">
        ← Evaluación ortopédica
      </Link>
      <OrthoImportScreen players={refs} defaultCampaign={currentCampaign(clubToday())} />
    </div>
  );
}
