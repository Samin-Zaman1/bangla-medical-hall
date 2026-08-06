import { redirect } from "next/navigation";
import { Clock, PackageCheck } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { WholesaleOrderForm } from "@/components/wholesale/wholesale-order-form";
import { OrderStatusActions } from "@/components/wholesale/order-status-actions";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/stat-tile";
import { PageHeader } from "@/components/ui/page-header";

type OrderItem = {
  id: number;
  quantity: number;
  unit_price: number;
  product: { generic_name: string } | null;
};

type WholesaleOrderRow = {
  id: number;
  status: string;
  total_amount: number;
  payment_method: string | null;
  created_at: string;
  prepared_at: string | null;
  paid_at: string | null;
  customer: { id: number; name: string } | null;
  wholesale_order_item: OrderItem[];
};

function statusBadge(status: string) {
  if (status === "paid") return <Badge variant="success" className="capitalize">{status}</Badge>;
  if (status === "cancelled") return <Badge variant="destructive" className="capitalize">{status}</Badge>;
  if (status === "prepared") return <Badge variant="neutral" className="capitalize">{status}</Badge>;
  return <Badge variant="warning" className="capitalize">{status}</Badge>;
}

async function getOrders(branchId: number): Promise<WholesaleOrderRow[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("wholesale_order")
    .select(
      "id, status, total_amount, payment_method, created_at, prepared_at, paid_at, customer(id, name), wholesale_order_item(id, quantity, unit_price, product(generic_name))",
    )
    .eq("branch_id", branchId)
    .order("id", { ascending: false });

  if (error) return [];
  return (data ?? []) as unknown as WholesaleOrderRow[];
}

export default async function WholesalePage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const orders = await getOrders(session.branchId);
  const pendingCount = orders.filter((o) => o.status === "pending").length;
  const preparedCount = orders.filter((o) => o.status === "prepared").length;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={PackageCheck}
        title="Wholesale Orders"
        description="Take bulk orders, prepare them, then collect payment."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <StatTile
          label="Pending orders"
          value={pendingCount}
          icon={Clock}
          tone={pendingCount > 0 ? "warning" : "default"}
        />
        <StatTile label="Prepared orders" value={preparedCount} icon={PackageCheck} />
      </div>

      <WholesaleOrderForm />

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-foreground">Orders</h2>
          <span className="text-sm text-muted-foreground">{orders.length} orders</span>
        </CardHeader>

        <div className="space-y-3">
          {orders.map((order) => (
            <div
              key={order.id}
              className="rounded-lg border border-border p-4 transition-colors hover:bg-muted/40"
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{order.customer?.name ?? "Walk-in"}</span>
                  {statusBadge(order.status)}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{order.total_amount}</span>
                  <OrderStatusActions orderId={order.id} status={order.status} />
                </div>
              </div>
              <ul className="text-sm text-muted-foreground">
                {order.wholesale_order_item.map((item) => (
                  <li key={item.id}>
                    {item.product?.generic_name ?? "—"} × {item.quantity} @ {item.unit_price}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {orders.length === 0 && <p className="text-sm text-muted-foreground">No wholesale orders yet.</p>}
        </div>
      </Card>
    </div>
  );
}
