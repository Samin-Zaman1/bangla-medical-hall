import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireAuth, requirePermission, isSessionUser } from "@/lib/auth/require-auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth();
  if (!isSessionUser(authResult)) return authResult;

  const { id } = await params;
  const supplierId = Number(id);
  if (!Number.isInteger(supplierId) || supplierId <= 0) {
    return NextResponse.json({ error: "A valid supplier id is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("supplier_product")
    .select("id, product_id, cost_price, product(generic_name, brand_name, sale_price)")
    .eq("supplier_id", supplierId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ catalog: data ?? [] });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requirePermission("log_incoming_stock");
  if (!isSessionUser(authResult)) return authResult;

  const { id } = await params;
  const supplierId = Number(id);
  if (!Number.isInteger(supplierId) || supplierId <= 0) {
    return NextResponse.json({ error: "A valid supplier id is required" }, { status: 400 });
  }

  let body: { productId?: unknown; costPrice?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const productId = Number(body.productId);
  if (!Number.isInteger(productId) || productId <= 0) {
    return NextResponse.json({ error: "A valid productId is required" }, { status: 400 });
  }

  let costPrice: number | null = null;
  if (body.costPrice !== undefined && body.costPrice !== null && body.costPrice !== "") {
    costPrice = Number(body.costPrice);
    if (!Number.isFinite(costPrice) || costPrice < 0) {
      return NextResponse.json({ error: "costPrice must be a non-negative number" }, { status: 400 });
    }
  }

  const supabase = getSupabaseAdmin();

  const { data: supplier, error: supplierError } = await supabase
    .from("supplier")
    .select("id")
    .eq("id", supplierId)
    .maybeSingle();
  if (supplierError) {
    return NextResponse.json({ error: supplierError.message }, { status: 500 });
  }
  if (!supplier) {
    return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("supplier_product")
    .upsert(
      { supplier_id: supplierId, product_id: productId, cost_price: costPrice },
      { onConflict: "supplier_id,product_id" },
    )
    .select("id, product_id, cost_price, product(generic_name, brand_name, sale_price)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ entry: data });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requirePermission("log_incoming_stock");
  if (!isSessionUser(authResult)) return authResult;

  const { id } = await params;
  const supplierId = Number(id);
  if (!Number.isInteger(supplierId) || supplierId <= 0) {
    return NextResponse.json({ error: "A valid supplier id is required" }, { status: 400 });
  }

  let body: { productId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const productId = Number(body.productId);
  if (!Number.isInteger(productId) || productId <= 0) {
    return NextResponse.json({ error: "A valid productId is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("supplier_product")
    .delete()
    .eq("supplier_id", supplierId)
    .eq("product_id", productId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
