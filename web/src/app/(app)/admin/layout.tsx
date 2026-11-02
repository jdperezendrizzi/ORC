import { requireAdmin } from "@/lib/admin";
import { AdminTabs } from "./tabs";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="space-y-5">
      <header className="space-y-3">
        <h1 className="text-2xl font-black">Administración</h1>
        <AdminTabs />
      </header>
      {children}
    </div>
  );
}
