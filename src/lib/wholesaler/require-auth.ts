import { NextResponse } from "next/server";
import { getSession, type WholesalerSessionUser } from "./session";

export async function requireWholesalerAuth(): Promise<WholesalerSessionUser | NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return session;
}

export function isWholesalerSessionUser(
  value: WholesalerSessionUser | NextResponse,
): value is WholesalerSessionUser {
  return !(value instanceof NextResponse);
}
