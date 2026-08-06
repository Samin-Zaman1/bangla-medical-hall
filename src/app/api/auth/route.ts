import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyPassword } from "@/lib/auth/password";
import {
  clearSessionCookieOptions,
  createSessionToken,
  getSession,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;
const failedAttempts = new Map<number, { count: number; lockedUntil: number }>();

function isLockedOut(userId: number): boolean {
  const entry = failedAttempts.get(userId);
  if (!entry) return false;
  if (entry.lockedUntil && entry.lockedUntil > Date.now()) return true;
  if (entry.lockedUntil && entry.lockedUntil <= Date.now()) {
    failedAttempts.delete(userId);
  }
  return false;
}

function recordFailedAttempt(userId: number): void {
  const entry = failedAttempts.get(userId) ?? { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCKOUT_MS;
  }
  failedAttempts.set(userId, entry);
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ user: session });
}

export async function POST(request: Request) {
  let body: { userId?: number; pin?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const userId = body.userId;
  const pin = body.pin?.trim();

  if (!userId || !pin) {
    return NextResponse.json(
      { error: "User and PIN are required" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: user, error: userError } = await supabase
    .from("app_user")
    .select("id, branch_id, name, role, pin_hash")
    .eq("id", userId)
    .maybeSingle();

  if (userError || !user || user.branch_id === null) {
    // Don't track lockout state for nonexistent users — userId is attacker-controlled and
    // unbounded, so keying the in-memory map on it here would let an attacker grow it without
    // limit just by sending distinct fake ids. Real userIds are a small, bounded set.
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  if (isLockedOut(userId)) {
    return NextResponse.json(
      { error: "Too many failed attempts. Try again in a few minutes." },
      { status: 429 },
    );
  }

  const valid = await verifyPassword(pin, user.pin_hash);
  if (!valid) {
    recordFailedAttempt(userId);
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  failedAttempts.delete(userId);

  const sessionUser = {
    id: user.id,
    branchId: user.branch_id,
    name: user.name,
    role: user.role,
  };

  const token = await createSessionToken(sessionUser);
  const cookieStore = await cookies();
  cookieStore.set(sessionCookieOptions(token));

  return NextResponse.json({ user: sessionUser });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.set(clearSessionCookieOptions());
  return NextResponse.json({ ok: true });
}
