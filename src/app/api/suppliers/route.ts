import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireAuth, requirePermission, isSessionUser } from "@/lib/auth/require-auth";

/** Supplier management — Phase 4 */
export async function GET() {
  const authResult = await requireAuth();
  if (!isSessionUser(authResult)) return authResult;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("supplier")
    .select("id, name, contact_info, payment_terms")
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ suppliers: data ?? [] });
}

export async function POST(request: Request) {
  const authResult = await requirePermission("log_incoming_stock");
  if (!isSessionUser(authResult)) return authResult;

  const body = await request.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim();

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("supplier")
    .insert({
      name,
      contact_info: body?.contactInfo ? String(body.contactInfo).trim() : null,
      payment_terms: body?.paymentTerms ? String(body.paymentTerms).trim() : null,
    })
    .select("id, name, contact_info, payment_terms")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ supplier: data });
}
