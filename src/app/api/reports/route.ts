import { NextResponse } from "next/server";
import { requirePermission, isSessionUser } from "@/lib/auth/require-auth";

/** Owner-only reports — Phase 7 */
export async function GET() {
  const authResult = await requirePermission("view_reports");
  if (!isSessionUser(authResult)) return authResult;
  return NextResponse.json({ error: "Not implemented" }, { status: 501 });
}
