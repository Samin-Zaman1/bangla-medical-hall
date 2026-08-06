import { redirect } from "next/navigation";
import { Inbox, Clock } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/stat-tile";
import { FulfillOrderForm } from "@/components/wholesaler-orders/fulfill-order-form";

type OrderItemRow = {
  id: number;
  product_id: number;
  quantity: number;
  unit_price: number;
  subtotal: number;
  fulfilled_quantity: number;
  product: { generic_name: string } | null;
};

type WholesalerOrderRow = {
  id: number;
  status: string;
  total_amount: number;
  created_at: string;
  fulfilled_at: string | null;
  wholesaler: { id: number; shop_name: string; phone: string | null } | null;
  wholesaler_order_item: OrderItemRow[];
};

function statusBadge(status: string) {
  if (status === "fulfilled") return <Badge variant="success" className="capitalize">{status}</Badge>;
  if (status === "partially_fulfilled") {
    return <Badge variant="warning">Partially fulfilled</Badge>;
  }
  return <Badge variant="neutral" className="capitalize">{status}</Badge>;
}

async function getOrders(): Promise<WholesalerOrderRow[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("wholesaler_order")
    .select(
      "id, status, total_amount, created_at, fulfilled_at, wholesaler(id, shop_name, phone), wholesaler_order_item(id, product_id, quantity, unit_price, subtotal, fulfilled_quantity, product(generic_name))",
    )
    .order("id", { ascending: false });

  if (error) return [];
  return (data ?? []) as unknown as WholesalerOrderRow[];
}

export default async function WholesalerOrdersPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const orders = await getOrders();
  const pendingCount = orders.filter((o) => o.status === "pending").length;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Inbox}
        title="Wholesaler Orders"
        description="Incoming restock requests from wholesale partner accounts."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <StatTile
          label="Pending orders"
          value={pendingCount}
          icon={Clock}
          tone={pendingCount > 0 ? "warning" : "default"}
        />
        <StatTile label="Total orders" value={orders.length} icon={Inbox} />
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-foreground">Orders</h2>
          <span className="text-sm text-muted-foreground">{orders.length} orders</span>
        </CardHeader>

        <div className="space-y-3">
          {orders.map((order) => (
            <div key={order.id} className="rounded-lg border border-border p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{order.wholesaler?.shop_name ?? "—"}</span>
                  {order.wholesaler?.phone && (
                    <span className="text-xs text-muted-foreground">{order.wholesaler.phone}</span>
                  )}
                  {statusBadge(order.status)}
                </div>
                <span className="text-sm font-medium text-foreground">
                  ৳{Number(order.total_amount).toFixed(2)}
                </span>
              </div>

              <ul className="mb-3 text-sm text-muted-foreground">
                {order.wholesaler_order_item.map((item) => (
                  <li key={item.id}>
                    {item.product?.generic_name ?? `Product #${item.product_id}`} — ordered {item.quantity}
                    {order.status !== "pending" && `, fulfilled ${item.fulfilled_quantity}`} @ ৳{item.unit_price}
                  </li>
                ))}
              </ul>

              {order.status === "pending" && (
                <FulfillOrderForm orderId={order.id} items={order.wholesaler_order_item} />
              )}
            </div>
          ))}
          {orders.length === 0 && <p className="text-sm text-muted-foreground">No wholesaler orders yet.</p>}
        </div>
      </Card>
    </div>
  );
}
