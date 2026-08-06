import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requirePermission, isSessionUser } from "@/lib/auth/require-auth";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requirePermission("log_incoming_stock");
  if (!isSessionUser(authResult)) return authResult;
  const session = authResult;

  const { id } = await params;
  const purchaseInvoiceId = Number(id);
  if (!Number.isInteger(purchaseInvoiceId) || purchaseInvoiceId <= 0) {
    return NextResponse.json({ error: "A valid purchase invoice id is required" }, { status: 400 });
  }

  let body: { action?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = String(body.action ?? "");
  if (action !== "confirm") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .rpc("confirm_purchase_invoice", {
      p_purchase_invoice_id: purchaseInvoiceId,
      p_branch_id: session.branchId,
      p_user_id: session.id,
    })
    .single<{ out_purchase_invoice_id: number; out_status: string }>();

  if (error) {
    const status = /purchase invoice not found/i.test(error.message)
      ? 404
      : /is not a draft/i.test(error.message)
        ? 409
        : /still need a matched product|no line items|invalid quantity/i.test(error.message)
          ? 422
          : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ ok: true, status: data.out_status });
}
