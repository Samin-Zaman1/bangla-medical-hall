import { NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { hasPermission, type Permission } from "@/lib/permissions";
import { getSession, type SessionUser } from "./session";

export async function requireAuth(): Promise<
  SessionUser | NextResponse
> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return session;
}

export async function requirePermission(
  permission: Permission,
): Promise<SessionUser | NextResponse> {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  if (!hasPermission(result.role, permission)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return result;
}

export function isSessionUser(
  value: SessionUser | NextResponse,
): value is SessionUser {
  return !(value instanceof NextResponse);
}

export type { UserRole };
