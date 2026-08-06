import Link from "next/link";
import { redirect } from "next/navigation";
import { Truck, PackagePlus } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { AddSupplierForm } from "@/components/purchases/add-supplier-form";
import { PurchaseOrderActions } from "@/components/purchases/purchase-order-actions";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/stat-tile";
import { PageHeader } from "@/components/ui/page-header";
import { Disclosure } from "@/components/ui/disclosure";

type Supplier = { id: number; name: string; contact_info: string | null; payment_terms: string | null };

type PurchaseRow = {
  id: number;
  date: string;
  total_amount: number | null;
  payment_status: string | null;
  order_status: string;
  supplier: { id: number; name: string } | null;
};

function orderStatusBadge(status: string) {
  if (status === "delivered") return <Badge variant="success" className="capitalize">{status}</Badge>;
  if (status === "cancelled") return <Badge variant="destructive" className="capitalize">{status}</Badge>;
  return <Badge variant="warning" className="capitalize">{status}</Badge>;
}

function paymentStatusBadge(status: string) {
  if (status === "paid") return <Badge variant="success" className="capitalize">{status}</Badge>;
  return <Badge variant="neutral" className="capitalize">{status}</Badge>;
}

async function getSuppliers(): Promise<Supplier[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("supplier")
    .select("id, name, contact_info, payment_terms")
    .order("name", { ascending: true });
  if (error) return [];
  return data ?? [];
}

async function getPurchases(branchId: number): Promise<PurchaseRow[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("purchase")
    .select("id, date, total_amount, payment_status, order_status, supplier(id, name)")
    .eq("branch_id", branchId)
    .order("id", { ascending: false });
  if (error) return [];
  return (data ?? []) as unknown as PurchaseRow[];
}

export default async function PurchasesPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const [suppliers, purchases] = await Promise.all([getSuppliers(), getPurchases(session.branchId)]);
  const canManage = hasPermission(session.role, "log_incoming_stock");
  const openOrders = purchases.filter((p) => p.order_status === "pending").length;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Truck}
        title="Stock In / Purchases"
        description="Order from suppliers and track delivery + payment."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <StatTile label="Active suppliers" value={suppliers.length} icon={Truck} />
        <StatTile
          label="Open orders"
          value={openOrders}
          icon={PackagePlus}
          tone={openOrders > 0 ? "warning" : "default"}
        />
      </div>

      {canManage && (
        <Disclosure label="Add supplier">
          <AddSupplierForm />
        </Disclosure>
      )}

      <Card>
        <h2 className="mb-3.5 text-sm font-semibold text-foreground">Suppliers</h2>
        {suppliers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No suppliers yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {suppliers.map((supplier) => (
              <li key={supplier.id}>
                <Link
                  href={`/purchases/${supplier.id}`}
                  className="rounded-lg border border-input px-3 py-1.5 text-sm text-foreground transition-all hover:border-primary/40 hover:bg-accent hover:text-accent-foreground hover:shadow-sm"
                >
                  {supplier.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-foreground">Purchase orders</h2>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">Supplier</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Total</th>
                <th className="px-3 py-2 font-medium">Delivery</th>
                <th className="px-3 py-2 font-medium">Payment</th>
                {canManage && <th className="px-3 py-2 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {purchases.map((purchase) => (
                <tr key={purchase.id} className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50">
                  <td className="px-3 py-2.5 font-medium text-foreground">{purchase.supplier?.name ?? "—"}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{purchase.date}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{purchase.total_amount ?? "—"}</td>
                  <td className="px-3 py-2.5">{orderStatusBadge(purchase.order_status)}</td>
                  <td className="px-3 py-2.5">{paymentStatusBadge(purchase.payment_status ?? "due")}</td>
                  {canManage && (
                    <td className="px-3 py-2.5">
                      <PurchaseOrderActions
                        purchaseId={purchase.id}
                        orderStatus={purchase.order_status}
                        paymentStatus={purchase.payment_status ?? "due"}
                      />
                    </td>
                  )}
                </tr>
              ))}
              {purchases.length === 0 && (
                <tr>
                  <td colSpan={canManage ? 6 : 5} className="px-3 py-6 text-center text-muted-foreground">
                    No purchase orders yet.
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
