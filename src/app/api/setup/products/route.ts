import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { checkSetupAllowed } from "@/lib/setup-guard";

export async function POST(request: Request) {
  const blocked = checkSetupAllowed(request);
  if (blocked) return blocked;

  const supabase = getSupabaseAdmin();

  const products = [
    { generic_name: "Paracetamol 500mg", sale_price: 2.5 },
    { generic_name: "Amoxicillin 250mg", sale_price: 4.0 },
    { generic_name: "Vitamin C 1000mg", sale_price: 3.25 },
  ];

  const { data: existing, error: existingError } = await supabase
    .from("product")
    .select("generic_name")
    .in("generic_name", products.map((item) => item.generic_name));

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  const existingNames = new Set((existing ?? []).map((item) => item.generic_name));
  const toInsert = products.filter((item) => !existingNames.has(item.generic_name));

  if (toInsert.length > 0) {
    const { data, error } = await supabase.from("product").insert(toInsert).select();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, products: data ?? [] });
  }

  return NextResponse.json({ ok: true, products: [] });
}
