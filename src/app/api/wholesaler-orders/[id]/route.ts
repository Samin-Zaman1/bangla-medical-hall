import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requirePermission, isSessionUser } from "@/lib/auth/require-auth";

type FulfillItemInput = { orderItemId?: unknown; fulfillQuantity?: unknown };

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requirePermission("process_sale");
  if (!isSessionUser(authResult)) return authResult;
  const session = authResult;

  const { id } = await params;
  const orderId = Number(id);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return NextResponse.json({ error: "A valid order id is required" }, { status: 400 });
  }

  let body: { action?: unknown; items?: FulfillItemInput[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = String(body.action ?? "");
  if (action !== "fulfill") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "At least one item is required" }, { status: 400 });
  }

  const items = body.items.map((item) => ({
    order_item_id: Number(item.orderItemId),
    fulfill_quantity: Number(item.fulfillQuantity),
  }));

  for (const item of items) {
    if (!Number.isInteger(item.order_item_id) || item.order_item_id <= 0) {
      return NextResponse.json({ error: "Each item needs a valid orderItemId" }, { status: 400 });
    }
    if (!Number.isInteger(item.fulfill_quantity) || item.fulfill_quantity < 0) {
      return NextResponse.json(
        { error: "Each item needs a non-negative integer fulfillQuantity" },
        { status: 400 },
      );
    }
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .rpc("fulfill_wholesaler_order", {
      p_order_id: orderId,
      p_branch_id: session.branchId,
      p_user_id: session.id,
      p_items: items,
    })
    .single<{ out_order_id: number; out_sale_id: number; out_status: string }>();

  if (error) {
    const status = /wholesaler order not found/i.test(error.message)
      ? 404
      : /order item .* not found/i.test(error.message)
        ? 404
        : /is not pending/i.test(error.message)
          ? 409
          : /insufficient stock/i.test(error.message)
            ? 409
            : /only .* were ordered|fulfill_quantity must be|at least one item/i.test(error.message)
              ? 400
              : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ ok: true, status: data.out_status, saleId: data.out_sale_id });
}
