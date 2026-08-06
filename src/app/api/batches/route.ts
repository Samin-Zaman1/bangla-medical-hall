import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireAuth, requirePermission, isSessionUser } from "@/lib/auth/require-auth";

/** Batch inventory — Phase 2 */
export async function GET() {
  const authResult = await requireAuth();
  if (!isSessionUser(authResult)) return authResult;
  const session = authResult;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("batch")
    .select("id, product_id, batch_number, expiry_date, cost_price, quantity, product(generic_name, brand_name)")
    .eq("branch_id", session.branchId)
    .order("expiry_date", { ascending: true, nullsFirst: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ batches: data ?? [] });
}

export async function POST(request: Request) {
  const authResult = await requirePermission("stock_adjustment");
  if (!isSessionUser(authResult)) return authResult;
  const session = authResult;

  let body: {
    productId?: unknown;
    quantity?: unknown;
    expiryDate?: unknown;
    batchNumber?: unknown;
    costPrice?: unknown;
    supplierId?: unknown;
  };
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

  const batchNumber = body.batchNumber ? String(body.batchNumber).trim() : null;
  const expiryDate = body.expiryDate ? String(body.expiryDate) : null;
  const costPrice =
    body.costPrice !== undefined && body.costPrice !== null && body.costPrice !== ""
      ? Number(body.costPrice)
      : null;
  const supplierId = body.supplierId ? Number(body.supplierId) : null;

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .rpc("create_batch", {
      p_branch_id: session.branchId,
      p_product_id: productId,
      p_quantity: quantity,
      p_batch_number: batchNumber,
      p_expiry_date: expiryDate,
      p_cost_price: costPrice,
      p_supplier_id: supplierId,
      p_user_id: session.id,
    })
    .single<{ batch_id: number; quantity: number }>();

  if (error) {
    const status = /product not found/i.test(error.message)
      ? 404
      : /quantity must be/i.test(error.message)
        ? 400
        : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ ok: true, batch: { id: data.batch_id, quantity: data.quantity } });
}

export async function PATCH(request: Request) {
  const authResult = await requirePermission("stock_adjustment");
  if (!isSessionUser(authResult)) return authResult;
  const session = authResult;

  let body: { batchId?: unknown; quantityDelta?: unknown; reason?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const batchId = Number(body.batchId);
  const quantityDelta = Number(body.quantityDelta);
  const reason = body.reason ? String(body.reason).trim() : null;

  if (!Number.isInteger(batchId) || batchId <= 0) {
    return NextResponse.json({ error: "A valid batchId is required" }, { status: 400 });
  }
  if (!Number.isInteger(quantityDelta) || quantityDelta === 0) {
    return NextResponse.json({ error: "quantityDelta must be a non-zero integer" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .rpc("adjust_batch_quantity", {
      p_batch_id: batchId,
      p_branch_id: session.branchId,
      p_quantity_delta: quantityDelta,
      p_reason: reason,
      p_user_id: session.id,
    })
    .single<{ batch_id: number; quantity: number }>();

  if (error) {
    const status = /batch not found/i.test(error.message)
      ? 404
      : /negative stock/i.test(error.message)
        ? 409
        : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ ok: true, batch: { id: data.batch_id, quantity: data.quantity } });
}
