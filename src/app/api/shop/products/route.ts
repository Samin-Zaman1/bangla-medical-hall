import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

// Public, unauthenticated storefront feed. wholesale_price is never selected here at all
// (not just stripped after fetching) so it structurally cannot appear in this response.
export async function GET() {
  const supabase = getSupabaseAdmin();

  const [{ data: products, error: productsError }, { data: batches, error: batchesError }] =
    await Promise.all([
      supabase
        .from("product")
        .select("id, generic_name, brand_name, sale_price")
        .order("generic_name", { ascending: true }),
      supabase.from("batch").select("product_id, quantity"),
    ]);

  if (productsError) {
    return NextResponse.json({ error: productsError.message }, { status: 500 });
  }
  if (batchesError) {
    return NextResponse.json({ error: batchesError.message }, { status: 500 });
  }

  const stockTotals = new Map<number, number>();
  for (const row of batches ?? []) {
    if (row.product_id === null) continue;
    stockTotals.set(row.product_id, (stockTotals.get(row.product_id) ?? 0) + row.quantity);
  }

  const catalog = (products ?? []).map((product) => ({
    id: product.id,
    generic_name: product.generic_name,
    brand_name: product.brand_name,
    retail_price: product.sale_price,
    stock_quantity: stockTotals.get(product.id) ?? 0,
  }));

  return NextResponse.json({ products: catalog });
}
