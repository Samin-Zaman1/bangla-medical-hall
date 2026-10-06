import { redirect } from "next/navigation";
import Link from "next/link";
import { History, Receipt } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/stat-tile";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type SaleRow = {
  id: number;
  timestamp: string;
  total_amount: number;
  payment_method: string | null;
  receipt_number: string | null;
  branch: { name: string } | null;
  processed_by: { name: string } | null;
  customer: { name: string } | null;
};

// Dates in the filter are Bangladesh calendar days. sale.timestamp is a naive UTC timestamp
// (Postgres now() on Supabase), so each day's bounds are Dhaka midnight expressed in UTC.
function todayDateString(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date());
}

function dhakaMidnightUtc(date: string, addDays = 0): string {
  const midnight = new Date(`${date}T00:00:00+06:00`);
  midnight.setUTCDate(midnight.getUTCDate() + addDays);
  return midnight.toISOString().slice(0, 19);
}

function paymentBadge(method: string | null) {
  if (!method) return <Badge variant="neutral">—</Badge>;
  return <Badge variant="neutral" className="capitalize">{method}</Badge>;
}

async function getSales(branchId: number, from: string, to: string): Promise<SaleRow[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("sale")
    .select(
      "id, timestamp, total_amount, payment_method, receipt_number, branch(name), processed_by:app_user!user_id(name), customer(name)",
    )
    .eq("branch_id", branchId)
    .gte("timestamp", dhakaMidnightUtc(from))
    .lt("timestamp", dhakaMidnightUtc(to, 1))
    .order("timestamp", { ascending: false });

  if (error) return [];
  return (data ?? []) as unknown as SaleRow[];
}

export default async function SalesHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const params = await searchParams;
  const today = todayDateString();
  const from = params.from || today;
  const to = params.to || today;

  const sales = await getSales(session.branchId, from, to);
  const totalAmount = sales.reduce((sum, sale) => sum + Number(sale.total_amount), 0);

  return (
    <div className="space-y-6">
      <PageHeader icon={History} title="Sales History" description="Past sales for this branch." />

      <form className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="space-y-1.5">
          <Label htmlFor="from">From</Label>
          <Input id="from" type="date" name="from" defaultValue={from} max={to} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="to">To</Label>
          <Input id="to" type="date" name="to" defaultValue={to} min={from} max={today} />
        </div>
        <Button type="submit">Filter</Button>
      </form>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatTile label="Sales in range" value={sales.length} icon={Receipt} />
        <StatTile label="Total revenue" value={`৳${totalAmount.toFixed(2)}`} icon={History} />
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-foreground">Sales</h2>
          <span className="text-sm text-muted-foreground">{sales.length} sales</span>
        </CardHeader>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">Date/time</th>
                <th className="px-3 py-2 font-medium">Receipt #</th>
                <th className="px-3 py-2 font-medium">Branch</th>
                <th className="px-3 py-2 font-medium">Staff</th>
                <th className="px-3 py-2 font-medium">Payment</th>
                <th className="px-3 py-2 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => (
                <tr key={sale.id} className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50">
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {new Date(`${sale.timestamp}Z`).toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })}
                  </td>
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/sales/history/${sale.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {sale.receipt_number ?? `#${sale.id}`}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{sale.branch?.name ?? "—"}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{sale.processed_by?.name ?? "—"}</td>
                  <td className="px-3 py-2.5">{paymentBadge(sale.payment_method)}</td>
                  <td className="px-3 py-2.5 font-medium text-foreground">৳{Number(sale.total_amount).toFixed(2)}</td>
                </tr>
              ))}
              {sales.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                    No sales in this date range.
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
