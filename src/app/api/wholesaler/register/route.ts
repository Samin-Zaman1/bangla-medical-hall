import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { hashPassword } from "@/lib/auth/password";
import { createSessionToken, sessionCookieOptions } from "@/lib/wholesaler/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export async function POST(request: Request) {
  let body: { shopName?: unknown; phone?: unknown; email?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const shopName = String(body.shopName ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const phone = body.phone ? String(body.phone).trim() : null;

  if (!shopName) {
    return NextResponse.json({ error: "shopName is required" }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();

  const { data: existing, error: lookupError } = await supabase
    .from("wholesaler")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 });
  }
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);

  const { data: inserted, error: insertError } = await supabase
    .from("wholesaler")
    .insert({ shop_name: shopName, phone, email, password_hash: passwordHash })
    .select("id, shop_name, phone, email, created_at")
    .single();

  if (insertError || !inserted) {
    return NextResponse.json({ error: insertError?.message ?? "Registration failed" }, { status: 500 });
  }

  const sessionUser = { id: inserted.id as number, shopName: inserted.shop_name as string, email: inserted.email as string };
  const token = await createSessionToken(sessionUser);
  const cookieStore = await cookies();
  cookieStore.set(sessionCookieOptions(token));

  return NextResponse.json({
    ok: true,
    wholesaler: {
      id: inserted.id,
      shopName: inserted.shop_name,
      phone: inserted.phone,
      email: inserted.email,
      createdAt: inserted.created_at,
    },
  });
}
