import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requirePermission, isSessionUser } from "@/lib/auth/require-auth";

const VALID_PAYMENT_METHODS = ["cash", "bkash", "nagad", "credit"];

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requirePermission("process_sale");
  if (!isSessionUser(authResult)) return authResult;
  const session = authResult;

  const { id } = await params;
  const orderId = Number(id);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return NextResponse.json({ error: "A valid order id is required" }, { status: 400 });
  }

  let body: { action?: unknown; paymentMethod?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = String(body.action ?? "");
  const supabase = getSupabaseAdmin();

  if (action === "prepare") {
    const { data, error } = await supabase
      .rpc("prepare_wholesale_order", {
        p_order_id: orderId,
        p_branch_id: session.branchId,
        p_user_id: session.id,
      })
      .single<{ out_order_id: number; out_sale_id: number; out_status: string }>();

    if (error) {
      const status = /wholesale order not found/i.test(error.message)
        ? 404
        : /is not pending/i.test(error.message)
          ? 409
          : /insufficient stock/i.test(error.message)
            ? 409
            : 500;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json({ ok: true, status: data.out_status, saleId: data.out_sale_id });
  }

  if (action === "pay") {
    const paymentMethod = String(body.paymentMethod ?? "cash");
    if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
      return NextResponse.json({ error: "Invalid paymentMethod" }, { status: 400 });
    }

    // Credit puts the order's total on the customer's tab — same owner-only gate as any other
    // credit sale (src/app/api/sales/route.ts), not just a status label anymore.
    if (paymentMethod === "credit") {
      const creditAuth = await requirePermission("approve_credit_sale");
      if (!isSessionUser(creditAuth)) return creditAuth;
    }

    const { data, error } = await supabase
      .rpc("mark_wholesale_order_paid", {
        p_order_id: orderId,
        p_branch_id: session.branchId,
        p_payment_method: paymentMethod,
      })
      .single<{ out_order_id: number; out_status: string }>();

    if (error) {
      const status = /wholesale order not found/i.test(error.message)
        ? 404
        : /must be prepared before it can be paid/i.test(error.message)
          ? 409
          : /no customer attached|invalid payment method/i.test(error.message)
            ? 400
            : 500;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json({ ok: true, status: data.out_status });
  }

  if (action === "cancel") {
    const { data, error } = await supabase
      .from("wholesale_order")
      .update({ status: "cancelled" })
      .eq("id", orderId)
      .eq("branch_id", session.branchId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json(
        { error: "Order not found or not in a cancellable state" },
        { status: 409 },
      );
    }

    return NextResponse.json({ ok: true, status: "cancelled" });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
