import { BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/ui/stat-tile";

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <PageHeader icon={BarChart3} title="Reports" description="Coming soon — Phase 7 (Owner only)." />
      <div className="grid gap-4 sm:grid-cols-2">
        <StatTile label="Reports available" value="—" icon={BarChart3} />
      </div>
    </div>
  );
}
