import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Receipt } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PrintButton } from "@/components/sales/print-button";

type SaleItemRow = {
  id: number;
  quantity: number;
  price_at_sale: number;
  batch: { product: { generic_name: string; brand_name: string | null } | null } | null;
};

type SaleDetail = {
  id: number;
  timestamp: string;
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  payment_method: string | null;
  receipt_number: string | null;
  branch: { name: string } | null;
  processed_by: { name: string } | null;
  discount_applied_by: { name: string } | null;
  customer: { name: string } | null;
  sale_item: SaleItemRow[];
};

export default async function SaleReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const { id } = await params;
  const saleId = Number(id);
  if (!Number.isInteger(saleId) || saleId <= 0) {
    notFound();
  }

  const supabase = getSupabaseAdmin();
  const { data: sale } = await supabase
    .from("sale")
    .select(
      "id, timestamp, subtotal, discount_amount, total_amount, payment_method, receipt_number, " +
        "branch(name), processed_by:app_user!user_id(name), discount_applied_by:app_user!discount_applied_by(name), " +
        "customer(name), sale_item(id, quantity, price_at_sale, batch(product(generic_name, brand_name)))",
    )
    .eq("id", saleId)
    .eq("branch_id", session.branchId)
    .maybeSingle<SaleDetail>();

  if (!sale) {
    notFound();
  }

  // sale.timestamp is naive UTC; show it in Bangladesh time whatever the server's zone.
  const soldAt = new Date(`${sale.timestamp}Z`).toLocaleString("en-GB", { timeZone: "Asia/Dhaka" });

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <Link
          href="/sales/history"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to sales history
        </Link>
        <PageHeader
          icon={Receipt}
          title={sale.receipt_number ?? `Sale #${sale.id}`}
          description={soldAt}
          action={<PrintButton />}
        />
      </div>

      <Card className="mx-auto max-w-xl">
        <CardHeader>
          <h2 className="text-sm font-semibold text-foreground">Receipt</h2>
          {sale.payment_method && <Badge variant="neutral" className="capitalize">{sale.payment_method}</Badge>}
        </CardHeader>

        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-muted-foreground">Receipt #</dt>
          <dd className="text-right text-foreground">{sale.receipt_number ?? `#${sale.id}`}</dd>
          <dt className="text-muted-foreground">Date/time</dt>
          <dd className="text-right text-foreground">{soldAt}</dd>
          <dt className="text-muted-foreground">Branch</dt>
          <dd className="text-right text-foreground">{sale.branch?.name ?? "—"}</dd>
          <dt className="text-muted-foreground">Processed by</dt>
          <dd className="text-right text-foreground">{sale.processed_by?.name ?? "—"}</dd>
          {sale.customer?.name && (
            <>
              <dt className="text-muted-foreground">Customer</dt>
              <dd className="text-right text-foreground">{sale.customer.name}</dd>
            </>
          )}
          {sale.discount_applied_by?.name && (
            <>
              <dt className="text-muted-foreground">Discount by</dt>
              <dd className="text-right text-foreground">{sale.discount_applied_by.name}</dd>
            </>
          )}
        </dl>

        <div className="mt-4 border-t border-border pt-4">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-1.5 font-medium">Item</th>
                <th className="py-1.5 text-right font-medium">Qty</th>
                <th className="py-1.5 text-right font-medium">Price</th>
                <th className="py-1.5 text-right font-medium">Line total</th>
              </tr>
            </thead>
            <tbody>
              {sale.sale_item.map((item) => (
                <tr key={item.id} className="border-b border-border/60 last:border-0">
                  <td className="py-1.5 text-foreground">
                    {item.batch?.product?.generic_name ?? "—"}
                    {item.batch?.product?.brand_name ? ` — ${item.batch.product.brand_name}` : ""}
                  </td>
                  <td className="py-1.5 text-right text-muted-foreground">{item.quantity}</td>
                  <td className="py-1.5 text-right text-muted-foreground">৳{Number(item.price_at_sale).toFixed(2)}</td>
                  <td className="py-1.5 text-right text-foreground">
                    ৳{(item.quantity * Number(item.price_at_sale)).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 space-y-1 border-t border-border pt-4 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span>৳{Number(sale.subtotal).toFixed(2)}</span>
          </div>
          {Number(sale.discount_amount) > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Discount</span>
              <span>-৳{Number(sale.discount_amount).toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-semibold text-foreground">
            <span>Total</span>
            <span>৳{Number(sale.total_amount).toFixed(2)}</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
