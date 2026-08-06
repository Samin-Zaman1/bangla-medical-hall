import { NextResponse } from "next/server";
import { requireAuth, requirePermission, isSessionUser } from "@/lib/auth/require-auth";

/** Product request logging — Phase 6 */
export async function GET() {
  const authResult = await requireAuth();
  if (!isSessionUser(authResult)) return authResult;
  return NextResponse.json({ error: "Not implemented" }, { status: 501 });
}

export async function POST() {
  const authResult = await requirePermission("log_product_request");
  if (!isSessionUser(authResult)) return authResult;
  return NextResponse.json({ error: "Not implemented" }, { status: 501 });
}
