import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requirePermission, isSessionUser } from "@/lib/auth/require-auth";

type BatchOverride = {
  purchaseItemId?: unknown;
  batchNumber?: unknown;
  expiryDate?: unknown;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requirePermission("log_incoming_stock");
  if (!isSessionUser(authResult)) return authResult;
  const session = authResult;

  const { id } = await params;
  const purchaseId = Number(id);
  if (!Number.isInteger(purchaseId) || purchaseId <= 0) {
    return NextResponse.json({ error: "A valid purchase id is required" }, { status: 400 });
  }

  let body: { action?: unknown; batchOverrides?: BatchOverride[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = String(body.action ?? "");
  const supabase = getSupabaseAdmin();

  if (action === "deliver") {
    const overrides = Array.isArray(body.batchOverrides)
      ? body.batchOverrides.map((o) => ({
          purchase_item_id: Number(o.purchaseItemId),
          batch_number: o.batchNumber ? String(o.batchNumber).trim() : null,
          expiry_date: o.expiryDate ? String(o.expiryDate) : null,
        }))
      : null;

    const { data, error } = await supabase
      .rpc("mark_purchase_delivered", {
        p_purchase_id: purchaseId,
        p_branch_id: session.branchId,
        p_user_id: session.id,
        p_batch_overrides: overrides,
      })
      .single<{ out_purchase_id: number; out_order_status: string }>();

    if (error) {
      const status = /purchase order not found/i.test(error.message)
        ? 404
        : /is not pending/i.test(error.message)
          ? 409
          : 500;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json({ ok: true, orderStatus: data.out_order_status });
  }

  if (action === "pay") {
    const { data: purchase, error: fetchError } = await supabase
      .from("purchase")
      .select("id, order_status")
      .eq("id", purchaseId)
      .eq("branch_id", session.branchId)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }
    if (!purchase) {
      return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });
    }
    if (purchase.order_status === "cancelled") {
      return NextResponse.json({ error: "Cannot mark a cancelled order as paid" }, { status: 409 });
    }

    const { error } = await supabase.from("purchase").update({ payment_status: "paid" }).eq("id", purchaseId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, paymentStatus: "paid" });
  }

  if (action === "cancel") {
    const { data, error } = await supabase
      .from("purchase")
      .update({ order_status: "cancelled" })
      .eq("id", purchaseId)
      .eq("branch_id", session.branchId)
      .eq("order_status", "pending")
      .select("id")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json(
        { error: "Purchase order not found or not in a cancellable state" },
        { status: 409 },
      );
    }

    return NextResponse.json({ ok: true, orderStatus: "cancelled" });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
