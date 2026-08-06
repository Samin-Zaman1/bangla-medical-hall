import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireWholesalerAuth, isWholesalerSessionUser } from "@/lib/wholesaler/require-auth";

type OrderItemInput = { productId?: unknown; quantity?: unknown };

// Wholesaler-only: wholesaler_id always comes from the authenticated session, never the
// request body — a wholesaler must only ever be able to place an order as themselves.
export async function POST(request: Request) {
  const authResult = await requireWholesalerAuth();
  if (!isWholesalerSessionUser(authResult)) return authResult;
  const session = authResult;

  let body: { items?: OrderItemInput[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "At least one item is required" }, { status: 400 });
  }

  const items = body.items.map((item) => ({
    product_id: Number(item.productId),
    quantity: Number(item.quantity),
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
    .rpc("create_wholesaler_order", {
      p_wholesaler_id: session.id,
      p_items: items,
    })
    .single<{ out_order_id: number; out_total_amount: number }>();

  if (error) {
    const status = /wholesaler not found/i.test(error.message)
      ? 404
      : /not available for wholesale/i.test(error.message)
        ? 400
        : /insufficient stock/i.test(error.message)
          ? 409
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
