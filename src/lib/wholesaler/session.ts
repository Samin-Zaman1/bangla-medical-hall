import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import { SESSION_MAX_AGE_SECONDS } from "@/lib/auth/constants";
import { WHOLESALER_SESSION_COOKIE } from "./constants";

export type WholesalerSessionUser = {
  id: number;
  shopName: string;
  email: string;
};

// Discriminant claim, not just a distinct cookie name — makes a wholesaler token
// unverifiable as a staff session (and vice versa) even if a cookie ever got misrouted.
type WholesalerSessionPayload = WholesalerSessionUser & { type: "wholesaler" };

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET environment variable is not set");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(user: WholesalerSessionUser): Promise<string> {
  return new SignJWT({ ...user, type: "wholesaler" } satisfies WholesalerSessionPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(
  token: string,
): Promise<WholesalerSessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    const { id, shopName, email, type } = payload as WholesalerSessionPayload;
    if (
      type !== "wholesaler" ||
      typeof id !== "number" ||
      typeof shopName !== "string" ||
      typeof email !== "string"
    ) {
      return null;
    }
    return { id, shopName, email };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<WholesalerSessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(WHOLESALER_SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export function sessionCookieOptions(token: string) {
  return {
    name: WHOLESALER_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export function clearSessionCookieOptions() {
  return {
    name: WHOLESALER_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
}
