import { SESSION_COOKIE } from "@/lib/auth/constants";
import { createSessionToken, type SessionUser } from "@/lib/auth/session";
import { WHOLESALER_SESSION_COOKIE } from "@/lib/wholesaler/constants";
import {
  createSessionToken as createWholesalerToken,
  type WholesalerSessionUser,
} from "@/lib/wholesaler/session";
import { setCookie } from "./cookies";

export const OWNER: SessionUser = { id: 1, branchId: 1, name: "Owner", role: "owner" };
export const STAFF: SessionUser = { id: 2, branchId: 1, name: "Staff", role: "staff" };
export const WHOLESALER: WholesalerSessionUser = { id: 7, shopName: "Rahim Pharma", email: "rahim@example.com" };

/** Signs a real session token and puts it in the cookie jar, so routes go through real auth. */
export async function signInAs(user: SessionUser = OWNER) {
  setCookie(SESSION_COOKIE, await createSessionToken(user));
  return user;
}

export async function signInAsWholesaler(user: WholesalerSessionUser = WHOLESALER) {
  setCookie(WHOLESALER_SESSION_COOKIE, await createWholesalerToken(user));
  return user;
}
