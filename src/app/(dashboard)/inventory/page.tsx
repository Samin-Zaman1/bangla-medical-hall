import { redirect } from "next/navigation";
import { Boxes, PackageSearch, CalendarClock } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { AddBatchForm } from "@/components/inventory/add-batch-form";
import { AdjustBatchControl } from "@/components/inventory/adjust-batch-control";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/stat-tile";
import { PageHeader } from "@/components/ui/page-header";
import { Disclosure } from "@/components/ui/disclosure";

type BatchRow = {
  id: number;
  product_id: number | null;
  batch_number: string | null;
  expiry_date: string | null;
  cost_price: number | null;
  quantity: number;
  product: { generic_name: string; brand_name: string | null } | null;
};

function getExpiryCutoff(): number {
  return Date.now() + 30 * 24 * 60 * 60 * 1000;
}

async function getBatches(branchId: number): Promise<BatchRow[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("batch")
    .select("id, product_id, batch_number, expiry_date, cost_price, quantity, product(generic_name, brand_name)")
    .eq("branch_id", branchId)
    .order("expiry_date", { ascending: true, nullsFirst: false });

  if (error) return [];
  return (data ?? []) as unknown as BatchRow[];
}

export default async function InventoryPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const batches = await getBatches(session.branchId);
  const canAdjustStock = hasPermission(session.role, "stock_adjustment");

  const totalUnits = batches.reduce((sum, b) => sum + b.quantity, 0);
  const expiryCutoff = getExpiryCutoff();
  const expiringSoonCount = batches.filter(
    (b) => b.expiry_date && new Date(b.expiry_date).getTime() <= expiryCutoff,
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader icon={Boxes} title="Inventory" description="Batches on hand, soonest expiry first." />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Total batches" value={batches.length} icon={Boxes} />
        <StatTile label="Total units in stock" value={totalUnits} icon={PackageSearch} />
        <StatTile
          label="Expiring within 30 days"
          value={expiringSoonCount}
          icon={CalendarClock}
          tone={expiringSoonCount > 0 ? "warning" : "default"}
        />
      </div>

      {canAdjustStock && (
        <Disclosure label="Add stock batch">
          <AddBatchForm />
        </Disclosure>
      )}

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-foreground">Batches</h2>
          <span className="text-sm text-muted-foreground">{batches.length} batches</span>
        </CardHeader>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">Product</th>
                <th className="px-3 py-2 font-medium">Batch #</th>
                <th className="px-3 py-2 font-medium">Expiry</th>
                <th className="px-3 py-2 font-medium">Cost</th>
                <th className="px-3 py-2 font-medium">Quantity</th>
                {canAdjustStock && <th className="px-3 py-2 font-medium">Adjust</th>}
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => {
                const expiringSoon =
                  batch.expiry_date && new Date(batch.expiry_date).getTime() <= expiryCutoff;
                return (
                  <tr
                    key={batch.id}
                    className={`border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50 ${expiringSoon ? "bg-warning-soft/40" : ""}`}
                  >
                    <td className="px-3 py-2.5 font-medium text-foreground">
                      {batch.product?.generic_name ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{batch.batch_number ?? "—"}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <span>{batch.expiry_date ?? "—"}</span>
                        {expiringSoon && <Badge variant="warning">Expiring soon</Badge>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{batch.cost_price ?? "—"}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{batch.quantity}</td>
                    {canAdjustStock && (
                      <td className="px-3 py-2.5">
                        <AdjustBatchControl batchId={batch.id} />
                      </td>
                    )}
                  </tr>
                );
              })}
              {batches.length === 0 && (
                <tr>
                  <td colSpan={canAdjustStock ? 6 : 5} className="px-3 py-6 text-center text-muted-foreground">
                    No batches yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
