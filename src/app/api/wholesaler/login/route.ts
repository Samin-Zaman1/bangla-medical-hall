import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyPassword } from "@/lib/auth/password";
import {
  clearSessionCookieOptions,
  createSessionToken,
  getSession,
  sessionCookieOptions,
} from "@/lib/wholesaler/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;
const failedAttempts = new Map<number, { count: number; lockedUntil: number }>();

function isLockedOut(wholesalerId: number): boolean {
  const entry = failedAttempts.get(wholesalerId);
  if (!entry) return false;
  if (entry.lockedUntil && entry.lockedUntil > Date.now()) return true;
  if (entry.lockedUntil && entry.lockedUntil <= Date.now()) {
    failedAttempts.delete(wholesalerId);
  }
  return false;
}

function recordFailedAttempt(wholesalerId: number): void {
  const entry = failedAttempts.get(wholesalerId) ?? { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCKOUT_MS;
  }
  failedAttempts.set(wholesalerId, entry);
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ wholesaler: session });
}

export async function POST(request: Request) {
  let body: { email?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: wholesaler, error: lookupError } = await supabase
    .from("wholesaler")
    .select("id, shop_name, email, password_hash")
    .eq("email", email)
    .maybeSingle();

  if (lookupError || !wholesaler) {
    // Same reasoning as staff login: don't key lockout state on attacker-controlled email
    // for accounts that don't exist — only track it once we have a real, bounded id.
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  if (isLockedOut(wholesaler.id)) {
    return NextResponse.json(
      { error: "Too many failed attempts. Try again in a few minutes." },
      { status: 429 },
    );
  }

  const valid = await verifyPassword(password, wholesaler.password_hash);
  if (!valid) {
    recordFailedAttempt(wholesaler.id);
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  failedAttempts.delete(wholesaler.id);

  const sessionUser = { id: wholesaler.id, shopName: wholesaler.shop_name, email: wholesaler.email };
  const token = await createSessionToken(sessionUser);
  const cookieStore = await cookies();
  cookieStore.set(sessionCookieOptions(token));

  return NextResponse.json({ wholesaler: sessionUser });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.set(clearSessionCookieOptions());
  return NextResponse.json({ ok: true });
}
