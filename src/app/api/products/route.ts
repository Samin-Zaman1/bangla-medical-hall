import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireAuth, requirePermission, isSessionUser } from "@/lib/auth/require-auth";

async function getStockTotalsByProduct(branchId: number): Promise<Map<number, number>> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("batch")
    .select("product_id, quantity")
    .eq("branch_id", branchId);

  const totals = new Map<number, number>();
  for (const row of data ?? []) {
    if (row.product_id === null) continue;
    totals.set(row.product_id, (totals.get(row.product_id) ?? 0) + row.quantity);
  }
  return totals;
}

export async function GET() {
  const authResult = await requireAuth();
  if (!isSessionUser(authResult)) return authResult;
  const session = authResult;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("product")
    .select(
      "id, generic_name, brand_name, manufacturer, form, strength, sale_price, wholesale_price, is_controlled, reorder_threshold",
    )
    .order("generic_name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const stockTotals = await getStockTotalsByProduct(session.branchId);
  const products = (data ?? []).map((product) => {
    const totalQuantity = stockTotals.get(product.id) ?? 0;
    return {
      ...product,
      total_quantity: totalQuantity,
      low_stock: totalQuantity <= product.reorder_threshold,
    };
  });

  return NextResponse.json({ products });
}

export async function POST(request: Request) {
  const authResult = await requirePermission("add_product");
  if (!isSessionUser(authResult)) return authResult;

  const body = await request.json().catch(() => ({}));

  const genericName = String(body?.genericName ?? "").trim();
  const salePrice = Number(body?.salePrice ?? 0);
  const reorderThreshold = body?.reorderThreshold !== undefined ? Number(body.reorderThreshold) : 10;

  if (!genericName) {
    return NextResponse.json({ error: "genericName is required" }, { status: 400 });
  }
  if (!Number.isFinite(salePrice) || salePrice < 0) {
    return NextResponse.json({ error: "salePrice must be a non-negative number" }, { status: 400 });
  }
  if (!Number.isInteger(reorderThreshold) || reorderThreshold < 0) {
    return NextResponse.json({ error: "reorderThreshold must be a non-negative integer" }, { status: 400 });
  }

  const hasWholesalePrice = body?.wholesalePrice !== undefined && body?.wholesalePrice !== null && body?.wholesalePrice !== "";
  const wholesalePrice = hasWholesalePrice ? Number(body.wholesalePrice) : null;
  if (hasWholesalePrice && (!Number.isFinite(wholesalePrice) || (wholesalePrice as number) < 0)) {
    return NextResponse.json({ error: "wholesalePrice must be a non-negative number" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("product")
    .insert({
      generic_name: genericName,
      brand_name: body?.brandName ? String(body.brandName).trim() : null,
      manufacturer: body?.manufacturer ? String(body.manufacturer).trim() : null,
      form: body?.form ? String(body.form).trim() : null,
      strength: body?.strength ? String(body.strength).trim() : null,
      is_controlled: Boolean(body?.isControlled),
      sale_price: salePrice,
      wholesale_price: wholesalePrice,
      reorder_threshold: reorderThreshold,
    })
    .select(
      "id, generic_name, brand_name, manufacturer, form, strength, sale_price, wholesale_price, is_controlled, reorder_threshold",
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ product: data });
}

export async function PATCH(request: Request) {
  const authResult = await requirePermission("add_product");
  if (!isSessionUser(authResult)) return authResult;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "A valid product id is required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.genericName !== undefined) {
    const genericName = String(body.genericName).trim();
    if (!genericName) {
      return NextResponse.json({ error: "genericName cannot be empty" }, { status: 400 });
    }
    updates.generic_name = genericName;
  }
  if (body.brandName !== undefined) updates.brand_name = body.brandName ? String(body.brandName).trim() : null;
  if (body.manufacturer !== undefined) updates.manufacturer = body.manufacturer ? String(body.manufacturer).trim() : null;
  if (body.form !== undefined) updates.form = body.form ? String(body.form).trim() : null;
  if (body.strength !== undefined) updates.strength = body.strength ? String(body.strength).trim() : null;
  if (body.isControlled !== undefined) updates.is_controlled = Boolean(body.isControlled);

  if (body.reorderThreshold !== undefined) {
    const reorderThreshold = Number(body.reorderThreshold);
    if (!Number.isInteger(reorderThreshold) || reorderThreshold < 0) {
      return NextResponse.json({ error: "reorderThreshold must be a non-negative integer" }, { status: 400 });
    }
    updates.reorder_threshold = reorderThreshold;
  }

  if (body.salePrice !== undefined) {
    const priceAuth = await requirePermission("edit_sale_price");
    if (!isSessionUser(priceAuth)) return priceAuth;

    const salePrice = Number(body.salePrice);
    if (!Number.isFinite(salePrice) || salePrice < 0) {
      return NextResponse.json({ error: "salePrice must be a non-negative number" }, { status: 400 });
    }
    updates.sale_price = salePrice;
  }

  if (body.wholesalePrice !== undefined) {
    const wholesalePriceAuth = await requirePermission("edit_wholesale_price");
    if (!isSessionUser(wholesalePriceAuth)) return wholesalePriceAuth;

    const wholesalePrice = body.wholesalePrice === null || body.wholesalePrice === "" ? null : Number(body.wholesalePrice);
    if (wholesalePrice !== null && (!Number.isFinite(wholesalePrice) || wholesalePrice < 0)) {
      return NextResponse.json({ error: "wholesalePrice must be a non-negative number" }, { status: 400 });
    }
    updates.wholesale_price = wholesalePrice;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("product")
    .update(updates)
    .eq("id", id)
    .select(
      "id, generic_name, brand_name, manufacturer, form, strength, sale_price, wholesale_price, is_controlled, reorder_threshold",
    )
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  return NextResponse.json({ product: data });
}
