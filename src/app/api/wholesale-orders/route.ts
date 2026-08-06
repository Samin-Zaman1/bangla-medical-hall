import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireAuth, requirePermission, isSessionUser } from "@/lib/auth/require-auth";

type WholesaleItemInput = {
  productId?: unknown;
  quantity?: unknown;
  unitPrice?: unknown;
};

export async function GET() {
  const authResult = await requireAuth();
  if (!isSessionUser(authResult)) return authResult;
  const session = authResult;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("wholesale_order")
    .select(
      "id, status, total_amount, payment_method, created_at, prepared_at, paid_at, sale_id, customer(id, name), wholesale_order_item(id, product_id, quantity, unit_price, product(generic_name))",
    )
    .eq("branch_id", session.branchId)
    .order("id", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ orders: data ?? [] });
}

export async function POST(request: Request) {
  const authResult = await requirePermission("process_sale");
  if (!isSessionUser(authResult)) return authResult;
  const session = authResult;

  let body: { customerId?: unknown; items?: WholesaleItemInput[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const customerId =
    body.customerId !== undefined && body.customerId !== null && body.customerId !== ""
      ? Number(body.customerId)
      : null;

  if (customerId !== null && (!Number.isInteger(customerId) || customerId <= 0)) {
    return NextResponse.json({ error: "customerId must be a valid id" }, { status: 400 });
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "At least one item is required" }, { status: 400 });
  }

  const items = body.items.map((item) => ({
    product_id: Number(item.productId),
    quantity: Number(item.quantity),
    unit_price:
      item.unitPrice !== undefined && item.unitPrice !== null && item.unitPrice !== ""
        ? Number(item.unitPrice)
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
    .rpc("create_wholesale_order", {
      p_branch_id: session.branchId,
      p_customer_id: customerId,
      p_user_id: session.id,
      p_items: items,
    })
    .single<{ out_order_id: number; out_total_amount: number }>();

  if (error) {
    const status = /customer not found/i.test(error.message)
      ? 404
      : /product .* not found/i.test(error.message)
        ? 404
        : /quantity must be/i.test(error.message)
          ? 400
          : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({
    ok: true,
    order: { id: data.out_order_id, totalAmount: data.out_total_amount },
  });
}
