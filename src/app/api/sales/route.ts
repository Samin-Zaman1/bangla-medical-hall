import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requirePermission, isSessionUser } from "@/lib/auth/require-auth";

const VALID_PAYMENT_METHODS = ["cash", "bkash", "nagad", "credit"];
const MAX_ITEMS = 100;

type SaleItemInput = { product_id: number; quantity: number };

export async function POST(request: Request) {
  const authResult = await requirePermission("process_sale");
  if (!isSessionUser(authResult)) return authResult;
  const session = authResult;

  let body: { items?: unknown; customerId?: unknown; paymentMethod?: unknown; discountAmount?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "Add at least one product to the bill" }, { status: 400 });
  }
  if (body.items.length > MAX_ITEMS) {
    return NextResponse.json({ error: `A bill can have at most ${MAX_ITEMS} lines` }, { status: 400 });
  }

  const items: SaleItemInput[] = [];
  for (const raw of body.items as { productId?: unknown; quantity?: unknown }[]) {
    const productId = Number(raw?.productId);
    const quantity = Number(raw?.quantity);
    if (!Number.isInteger(productId) || productId <= 0) {
      return NextResponse.json({ error: "Each item needs a valid productId" }, { status: 400 });
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return NextResponse.json({ error: "Quantity must be a positive integer" }, { status: 400 });
    }
    items.push({ product_id: productId, quantity });
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

  const discountAmount =
    body.discountAmount === undefined || body.discountAmount === null || body.discountAmount === ""
      ? 0
      : Math.round(Number(body.discountAmount) * 100) / 100;
  if (!Number.isFinite(discountAmount) || discountAmount < 0) {
    return NextResponse.json({ error: "Discount must be zero or a positive amount" }, { status: 400 });
  }

  if (discountAmount > 0) {
    const discountAuth = await requirePermission("apply_discount");
    if (!isSessionUser(discountAuth)) return discountAuth;
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
      p_items: items,
      p_customer_id: customerId,
      p_payment_method: paymentMethod,
      p_discount_amount: discountAmount,
    })
    .single<{
      sale_id: number;
      subtotal: number;
      total_amount: number;
      receipt_number: string;
    }>();

  if (error) {
    const message = error.message;
    const status = /product not found|customer not found/i.test(message)
      ? 404
      : /insufficient stock/i.test(message)
        ? 409
        : /quantity must be|invalid payment method|customer is required|discount|at least one item/i.test(message)
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
