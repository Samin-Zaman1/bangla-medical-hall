import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ClipboardList, Receipt } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { CatalogAddForm } from "@/components/purchases/catalog-add-form";
import { SupplierOrderForm } from "@/components/purchases/supplier-order-form";
import { PurchaseOrderActions } from "@/components/purchases/purchase-order-actions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/stat-tile";
import { Disclosure } from "@/components/ui/disclosure";

type CatalogEntry = {
  id: number;
  product_id: number;
  cost_price: number | null;
  product: { generic_name: string; brand_name: string | null } | null;
};

type PurchaseRow = {
  id: number;
  date: string;
  total_amount: number | null;
  payment_status: string | null;
  order_status: string;
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

async function getSupplier(supplierId: number) {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("supplier")
    .select("id, name, contact_info, payment_terms")
    .eq("id", supplierId)
    .maybeSingle();
  return data;
}

async function getCatalog(supplierId: number): Promise<CatalogEntry[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("supplier_product")
    .select("id, product_id, cost_price, product(generic_name, brand_name)")
    .eq("supplier_id", supplierId);
  if (error) return [];
  return (data ?? []) as unknown as CatalogEntry[];
}

async function getSupplierPurchases(supplierId: number, branchId: number): Promise<PurchaseRow[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("purchase")
    .select("id, date, total_amount, payment_status, order_status")
    .eq("supplier_id", supplierId)
    .eq("branch_id", branchId)
    .order("id", { ascending: false });
  if (error) return [];
  return data ?? [];
}

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ supplierId: string }>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const { supplierId: supplierIdParam } = await params;
  const supplierId = Number(supplierIdParam);
  if (!Number.isInteger(supplierId) || supplierId <= 0) {
    notFound();
  }

  const supplier = await getSupplier(supplierId);
  if (!supplier) {
    notFound();
  }

  const [catalog, purchases] = await Promise.all([
    getCatalog(supplierId),
    getSupplierPurchases(supplierId, session.branchId),
  ]);
  const canManage = hasPermission(session.role, "log_incoming_stock");
  const totalOrdered = purchases.reduce((sum, p) => sum + (p.total_amount ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link
          href="/purchases"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="size-3.5" /> All suppliers
        </Link>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{supplier.name}</h1>
        <p className="text-sm text-muted-foreground">
          {supplier.contact_info ?? "No contact info"} · {supplier.payment_terms ?? "No payment terms"}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatTile label="Orders placed" value={purchases.length} icon={ClipboardList} />
        <StatTile label="Total ordered" value={totalOrdered} icon={Receipt} />
      </div>

      {canManage && (
        <Disclosure label="Catalog">
          <CatalogAddForm supplierId={supplierId} />
        </Disclosure>
      )}

      {canManage && (
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-foreground">Place an order</h2>
          <SupplierOrderForm supplierId={supplierId} catalog={catalog} />
        </Card>
      )}

      <Card>
        <h2 className="mb-4 text-sm font-semibold text-foreground">Order history</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
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
                  <td colSpan={canManage ? 5 : 4} className="px-3 py-6 text-center text-muted-foreground">
                    No orders yet.
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
