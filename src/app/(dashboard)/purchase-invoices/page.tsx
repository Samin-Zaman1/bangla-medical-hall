import { redirect } from "next/navigation";
import Link from "next/link";
import { ReceiptText, Clock } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/stat-tile";

type PurchaseInvoiceRow = {
  id: number;
  status: string;
  supplier_name: string | null;
  created_at: string;
  purchase_invoice_item: { id: number }[];
};

function statusBadge(status: string) {
  if (status === "confirmed") return <Badge variant="success" className="capitalize">{status}</Badge>;
  return <Badge variant="warning" className="capitalize">{status}</Badge>;
}

async function getPurchaseInvoices(branchId: number): Promise<PurchaseInvoiceRow[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("purchase_invoice")
    .select("id, status, supplier_name, created_at, purchase_invoice_item(id)")
    .eq("branch_id", branchId)
    .order("id", { ascending: false });

  if (error) return [];
  return (data ?? []) as unknown as PurchaseInvoiceRow[];
}

export default async function PurchaseInvoicesPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const invoices = await getPurchaseInvoices(session.branchId);
  const draftCount = invoices.filter((i) => i.status === "draft").length;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ReceiptText}
        title="Purchase Invoices"
        description="Draft purchases extracted from photographed supplier invoices."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <StatTile
          label="Awaiting review"
          value={draftCount}
          icon={Clock}
          tone={draftCount > 0 ? "warning" : "default"}
        />
        <StatTile label="Total invoices" value={invoices.length} icon={ReceiptText} />
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-foreground">Invoices</h2>
          <span className="text-sm text-muted-foreground">{invoices.length} invoices</span>
        </CardHeader>

        <div className="space-y-2">
          {invoices.map((invoice) => (
            <Link
              key={invoice.id}
              href={`/purchase-invoices/${invoice.id}/review`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 transition-colors hover:bg-muted/50"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground">
                  {invoice.supplier_name ?? `Invoice #${invoice.id}`}
                </span>
                {statusBadge(invoice.status)}
              </div>
              <span className="text-sm text-muted-foreground">
                {invoice.purchase_invoice_item.length} item{invoice.purchase_invoice_item.length === 1 ? "" : "s"}
              </span>
            </Link>
          ))}
          {invoices.length === 0 && <p className="text-sm text-muted-foreground">No purchase invoices yet.</p>}
        </div>
      </Card>
    </div>
  );
}
