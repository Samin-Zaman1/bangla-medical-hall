import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireAuth, requirePermission, isSessionUser } from "@/lib/auth/require-auth";

type PurchaseItemInput = {
  productId?: unknown;
  quantity?: unknown;
  costPrice?: unknown;
};

/** Stock-in / purchases — Phase 4 */
export async function GET() {
  const authResult = await requireAuth();
  if (!isSessionUser(authResult)) return authResult;
  const session = authResult;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("purchase")
    .select(
      "id, date, total_amount, payment_status, order_status, supplier(id, name), purchase_item(id, product_id, quantity, cost_price, batch_id, product(generic_name))",
    )
    .eq("branch_id", session.branchId)
    .order("id", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ purchases: data ?? [] });
}

export async function POST(request: Request) {
  const authResult = await requirePermission("log_incoming_stock");
  if (!isSessionUser(authResult)) return authResult;
  const session = authResult;

  let body: { supplierId?: unknown; items?: PurchaseItemInput[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const supplierId = Number(body.supplierId);
  if (!Number.isInteger(supplierId) || supplierId <= 0) {
    return NextResponse.json({ error: "A valid supplierId is required" }, { status: 400 });
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "At least one item is required" }, { status: 400 });
  }

  const items = body.items.map((item) => ({
    product_id: Number(item.productId),
    quantity: Number(item.quantity),
    cost_price:
      item.costPrice !== undefined && item.costPrice !== null && item.costPrice !== ""
        ? Number(item.costPrice)
        : null,
  }));

  for (const item of items) {
    if (!Number.isInteger(item.product_id) || item.product_id <= 0) {
      return NextResponse.json({ error: "Each item needs a valid productId" }, { status: 400 });
    }
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      return NextResponse.json({ error: "Each item needs a positive integer quantity" }, { status: 400 });
    }
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .rpc("create_purchase_order", {
      p_branch_id: session.branchId,
      p_supplier_id: supplierId,
      p_user_id: session.id,
      p_items: items,
    })
    .single<{ out_purchase_id: number; out_total_amount: number }>();

  if (error) {
    const status = /supplier not found/i.test(error.message)
      ? 404
      : /not in this supplier/i.test(error.message)
        ? 400
        : /quantity must be/i.test(error.message)
          ? 400
          : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({
    ok: true,
    purchase: { id: data.out_purchase_id, totalAmount: data.out_total_amount },
  });
}
