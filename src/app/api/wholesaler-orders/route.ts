import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requirePermission, isSessionUser } from "@/lib/auth/require-auth";

// Staff-side list of incoming wholesaler orders. Reuses the "process_sale" permission, same as
// the existing staff wholesale_order routes (src/app/api/wholesale-orders/[id]/route.ts) —
// fulfilling one of these is a sale, same as preparing one of those.
export async function GET() {
  const authResult = await requirePermission("process_sale");
  if (!isSessionUser(authResult)) return authResult;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("wholesaler_order")
    .select(
      "id, status, total_amount, created_at, fulfilled_at, wholesaler(id, shop_name, phone), wholesaler_order_item(id, product_id, quantity, unit_price, subtotal, fulfilled_quantity, product(generic_name))",
    )
    .order("id", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ orders: data ?? [] });
}
