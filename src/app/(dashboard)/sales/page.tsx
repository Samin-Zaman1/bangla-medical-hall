import { redirect } from "next/navigation";
import Link from "next/link";
import { History, Receipt, ShoppingCart, TrendingUp } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatTile } from "@/components/ui/stat-tile";
import { PointOfSale, type PosCustomer, type PosProduct } from "@/components/sales/point-of-sale";

type ProductRow = {
  id: number;
  generic_name: string;
  brand_name: string | null;
  form: string | null;
  strength: string | null;
  sale_price: number;
  is_controlled: boolean | null;
  batch: { quantity: number }[];
};

type RecentSale = {
  id: number;
  timestamp: string;
  total_amount: number;
  payment_method: string | null;
  receipt_number: string | null;
  customer: { name: string } | null;
};

// sale.timestamp is a naive UTC timestamp (Postgres now() on Supabase); "today" means today in
// Bangladesh, so start-of-day is Dhaka midnight expressed in UTC.
function startOfTodayDhakaUtc(): string {
  const dhakaDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date());
  return new Date(`${dhakaDate}T00:00:00+06:00`).toISOString().slice(0, 19);
}

async function getPosData(branchId: number) {
  const supabase = getSupabaseAdmin();

  const [productsResult, customersResult, salesResult] = await Promise.all([
    supabase
      .from("product")
      .select("id, generic_name, brand_name, form, strength, sale_price, is_controlled, batch(quantity)")
      .eq("batch.branch_id", branchId)
      .gt("batch.quantity", 0)
      .order("generic_name", { ascending: true }),
    supabase.from("customer").select("id, name, phone, credit_balance").order("name", { ascending: true }),
    supabase
      .from("sale")
      .select("id, timestamp, total_amount, payment_method, receipt_number, customer(name)")
      .eq("branch_id", branchId)
      .gte("timestamp", startOfTodayDhakaUtc())
      .order("timestamp", { ascending: false }),
  ]);

  const products: PosProduct[] = ((productsResult.data ?? []) as unknown as ProductRow[]).map((p) => ({
    id: p.id,
    genericName: p.generic_name,
    brandName: p.brand_name,
    form: p.form,
    strength: p.strength,
    salePrice: Number(p.sale_price),
    isControlled: Boolean(p.is_controlled),
    stock: p.batch.reduce((sum, b) => sum + b.quantity, 0),
  }));

  const customers: PosCustomer[] = (customersResult.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    creditBalance: Number(c.credit_balance ?? 0),
  }));

  const todaysSales = (salesResult.data ?? []) as unknown as RecentSale[];

  return {
    products,
    customers,
    todaysSales,
    loadError: productsResult.error?.message ?? null,
  };
}

export default async function MakeASalePage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const { products, customers, todaysSales, loadError } = await getPosData(session.branchId);
  const todaysRevenue = todaysSales.reduce((sum, sale) => sum + Number(sale.total_amount), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ShoppingCart}
        title="Make a Sale"
        description="Add products to the bill — prices and totals are calculated automatically."
        action={
          <Link href="/sales/history">
            <Button type="button" variant="outline" className="inline-flex items-center">
              <History className="mr-1.5 size-4" />
              Sales history
            </Button>
          </Link>
        }
      />

      {loadError && (
        <p className="rounded-xl bg-destructive-soft px-4 py-3 text-sm text-destructive-soft-foreground" role="alert">
          Could not load products: {loadError}
        </p>
      )}

      <PointOfSale
        products={products}
        customers={customers}
        canApplyDiscount={hasPermission(session.role, "apply_discount")}
        canSellOnCredit={hasPermission(session.role, "approve_credit_sale")}
      />

      <section className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <StatTile label="Sales today" value={todaysSales.length} icon={Receipt} />
          <StatTile label="Revenue today" value={`৳${todaysRevenue.toFixed(2)}`} icon={TrendingUp} tone="success" />
        </div>

        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-foreground">Today&apos;s sales</h2>
            <Link href="/sales/history" className="text-sm font-medium text-primary hover:underline">
              View all
            </Link>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">Receipt #</th>
                  <th className="px-3 py-2 font-medium">Customer</th>
                  <th className="px-3 py-2 font-medium">Payment</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {todaysSales.slice(0, 10).map((sale) => (
                  <tr key={sale.id} className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50">
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {new Date(`${sale.timestamp}Z`).toLocaleTimeString("en-GB", {
                        timeZone: "Asia/Dhaka",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-2.5">
                      <Link href={`/sales/history/${sale.id}`} className="font-medium text-primary hover:underline">
                        {sale.receipt_number ?? `#${sale.id}`}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{sale.customer?.name ?? "Walk-in"}</td>
                    <td className="px-3 py-2.5">
                      <Badge variant={sale.payment_method === "credit" ? "warning" : "neutral"} className="capitalize">
                        {sale.payment_method ?? "—"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium text-foreground">
                      ৳{Number(sale.total_amount).toFixed(2)}
                    </td>
                  </tr>
                ))}
                {todaysSales.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                      No sales yet today.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </section>
    </div>
  );
}
