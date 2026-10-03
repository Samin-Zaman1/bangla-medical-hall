import { redirect } from "next/navigation";
import { BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/ui/stat-tile";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions";

export default async function ReportsPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  // Hiding the nav link isn't enough: staff could still type the URL.
  if (!hasPermission(session.role, "view_reports")) {
    redirect("/sales");
  }

  return (
    <div className="space-y-6">
      <PageHeader icon={BarChart3} title="Reports" description="Coming soon — Phase 7 (Owner only)." />
      <div className="grid gap-4 sm:grid-cols-2">
        <StatTile label="Reports available" value="—" icon={BarChart3} />
      </div>
    </div>
  );
}
