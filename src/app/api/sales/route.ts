import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireAuth, requirePermission, isSessionUser } from "@/lib/auth/require-auth";

const VALID_PAYMENT_METHODS = ["cash", "bkash", "nagad", "credit"];

export async function GET() {
  const authResult = await requireAuth();
  if (!isSessionUser(authResult)) return authResult;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("product")
    .select("id, generic_name, sale_price")
    .order("generic_name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ products: data ?? [] });
}

export async function POST(request: Request) {
  const authResult = await requirePermission("process_sale");
  if (!isSessionUser(authResult)) return authResult;
  const session = authResult;

  let body: { productId?: unknown; quantity?: unknown; customerId?: unknown; paymentMethod?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const productId = Number(body.productId);
  const quantity = Number(body.quantity);

  if (!Number.isInteger(productId) || productId <= 0) {
    return NextResponse.json({ error: "A valid productId is required" }, { status: 400 });
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return NextResponse.json({ error: "Quantity must be a positive integer" }, { status: 400 });
  }

  const paymentMethod = body.paymentMethod ? String(body.paymentMethod) : "cash";
  if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
    return NextResponse.json({ error: "Invalid paymentMethod" }, { status: 400 });
  }

  const customerId =
    body.customerId !== undefined && body.customerId !== null && body.customerId !== ""
      ? Number(body.customerId)
      : null;
  if (customerId !== null && (!Number.isInteger(customerId) || customerId <= 0)) {
    return NextResponse.json({ error: "customerId must be a valid id" }, { status: 400 });
  }

  // Credit is a bigger commitment than picking cash/bKash/Nagad — it puts the sale on a
  // customer's tab — so it needs the same owner-only gate as approving any other credit sale,
  // on top of the base process_sale permission already checked above.
  if (paymentMethod === "credit") {
    const creditAuth = await requirePermission("approve_credit_sale");
    if (!isSessionUser(creditAuth)) return creditAuth;
  }

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .rpc("create_sale", {
      p_branch_id: session.branchId,
      p_user_id: session.id,
      p_product_id: productId,
      p_quantity: quantity,
      p_customer_id: customerId,
      p_payment_method: paymentMethod,
    })
    .single<{
      sale_id: number;
      subtotal: number;
      total_amount: number;
      receipt_number: string;
    }>();

  if (error) {
    const message = error.message;
    const status = /product not found/i.test(message)
      ? 404
      : /customer not found/i.test(message)
        ? 404
        : /insufficient stock/i.test(message)
          ? 409
          : /quantity must be|invalid payment method|customer is required/i.test(message)
            ? 400
            : 500;
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({
    ok: true,
    sale: {
      id: data.sale_id,
      subtotal: data.subtotal,
      total_amount: data.total_amount,
      receipt_number: data.receipt_number,
    },
  });
}
