import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireAuth, requirePermission, isSessionUser } from "@/lib/auth/require-auth";

/** Customers and credit balance — Phase 5 */
export async function GET() {
  const authResult = await requireAuth();
  if (!isSessionUser(authResult)) return authResult;
  const session = authResult;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("customer")
    .select("id, name, phone, address, credit_balance")
    .eq("branch_id", session.branchId)
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ customers: data ?? [] });
}

export async function POST(request: Request) {
  const authResult = await requirePermission("process_sale");
  if (!isSessionUser(authResult)) return authResult;
  const session = authResult;

  const body = await request.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim();

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("customer")
    .insert({
      branch_id: session.branchId,
      name,
      phone: body?.phone ? String(body.phone).trim() : null,
      address: body?.address ? String(body.address).trim() : null,
    })
    .select("id, name, phone, address, credit_balance")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ customer: data });
}
