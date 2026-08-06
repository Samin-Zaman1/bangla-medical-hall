import { ClipboardList } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/ui/stat-tile";

export default function RequestsPage() {
  return (
    <div className="space-y-6">
      <PageHeader icon={ClipboardList} title="Product Requests" description="Coming soon — Phase 6." />
      <div className="grid gap-4 sm:grid-cols-2">
        <StatTile label="Open requests" value="—" icon={ClipboardList} />
      </div>
    </div>
  );
}
