import { redirect, notFound } from "next/navigation";
import { ReceiptText } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReviewItemsSection } from "@/components/purchase-invoices/review-items-section";
import { ConfirmPurchaseButton } from "@/components/purchase-invoices/confirm-purchase-button";

type ItemRow = {
  id: number;
  product_id: number | null;
  raw_extracted_name: string | null;
  quantity: number;
  unit_cost: number | null;
  matched: boolean;
  product: { id: number; generic_name: string; brand_name: string | null } | null;
};

type PurchaseInvoiceRow = {
  id: number;
  status: string;
  supplier_name: string | null;
  invoice_image_url: string;
  created_at: string;
};

function statusBadge(status: string) {
  if (status === "confirmed") return <Badge variant="success" className="capitalize">{status}</Badge>;
  return <Badge variant="warning" className="capitalize">{status}</Badge>;
}

export default async function PurchaseInvoiceReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const { id } = await params;
  const purchaseInvoiceId = Number(id);
  if (!Number.isInteger(purchaseInvoiceId) || purchaseInvoiceId <= 0) {
    notFound();
  }

  const supabase = getSupabaseAdmin();

  const { data: purchaseInvoice } = await supabase
    .from("purchase_invoice")
    .select("id, status, supplier_name, invoice_image_url, created_at")
    .eq("id", purchaseInvoiceId)
    .eq("branch_id", session.branchId)
    .maybeSingle<PurchaseInvoiceRow>();

  if (!purchaseInvoice) {
    notFound();
  }

  const { data: items } = await supabase
    .from("purchase_invoice_item")
    .select("id, product_id, raw_extracted_name, quantity, unit_cost, matched, product(id, generic_name, brand_name)")
    .eq("purchase_invoice_id", purchaseInvoiceId)
    .order("id", { ascending: true });

  const itemRows = (items ?? []) as unknown as ItemRow[];
  const unresolvedCount = itemRows.filter((item) => item.product_id === null).length;

  const { data: signedUrlData } = await supabase.storage
    .from("invoice-images")
    .createSignedUrl(purchaseInvoice.invoice_image_url, 300);

  const canEdit = hasPermission(session.role, "log_incoming_stock") && purchaseInvoice.status === "draft";

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ReceiptText}
        title={`Purchase Invoice #${purchaseInvoice.id}`}
        description={purchaseInvoice.supplier_name ?? "Supplier not extracted"}
        action={statusBadge(purchaseInvoice.status)}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-foreground">Invoice photo</h2>
          </CardHeader>
          {signedUrlData?.signedUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={signedUrlData.signedUrl}
              alt={`Invoice #${purchaseInvoice.id}`}
              className="w-full rounded-lg border border-border object-contain"
            />
          ) : (
            <p className="text-sm text-muted-foreground">Could not load the invoice image.</p>
          )}
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-foreground">Extracted line items</h2>
            <span className="text-sm text-muted-foreground">{itemRows.length} item{itemRows.length === 1 ? "" : "s"}</span>
          </CardHeader>

          <ReviewItemsSection purchaseInvoiceId={purchaseInvoice.id} items={itemRows} canEdit={canEdit} />

          {canEdit && (
            <div className="mt-5 border-t border-border pt-4">
              <ConfirmPurchaseButton
                purchaseInvoiceId={purchaseInvoice.id}
                disabled={itemRows.length === 0 || unresolvedCount > 0}
                unresolvedCount={unresolvedCount}
              />
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
