import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireAuth, requirePermission, isSessionUser } from "@/lib/auth/require-auth";

/** Credit (baki) payments — Phase 5 */
export async function GET(request: Request) {
  const authResult = await requireAuth();
  if (!isSessionUser(authResult)) return authResult;

  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get("customerId");

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("credit_payment")
    .select("id, customer_id, amount, date, user_id, customer(name), app_user(name)")
    .order("date", { ascending: false });

  if (customerId) {
    const id = Number(customerId);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "customerId must be a valid id" }, { status: 400 });
    }
    query = query.eq("customer_id", id);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ payments: data ?? [] });
}

export async function POST(request: Request) {
  const authResult = await requirePermission("approve_credit_sale");
  if (!isSessionUser(authResult)) return authResult;
  const session = authResult;

  let body: { customerId?: unknown; amount?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const customerId = Number(body.customerId);
  const amount = Number(body.amount);

  if (!Number.isInteger(customerId) || customerId <= 0) {
    return NextResponse.json({ error: "A valid customerId is required" }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .rpc("record_credit_payment", {
      p_customer_id: customerId,
      p_amount: amount,
      p_user_id: session.id,
    })
    .single<{ out_customer_id: number; out_credit_balance: number }>();

  if (error) {
    const status = /customer not found/i.test(error.message)
      ? 404
      : /exceeds outstanding credit balance|payment amount must be positive/i.test(error.message)
        ? 400
        : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({
    ok: true,
    customerId: data.out_customer_id,
    creditBalance: data.out_credit_balance,
  });
}
