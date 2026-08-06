import { getSession as getStaffSession, type SessionUser } from "@/lib/auth/session";
import { getSession as getWholesalerSession, type WholesalerSessionUser } from "./session";

export type AuthContext =
  | { type: "staff"; user: SessionUser }
  | { type: "wholesaler"; user: WholesalerSessionUser }
  | { type: "public" };

/** Not wired into route/page protection yet — that lands with the wholesaler catalog pages. */
export async function getAuthContext(): Promise<AuthContext> {
  const staffUser = await getStaffSession();
  if (staffUser) return { type: "staff", user: staffUser };

  const wholesalerUser = await getWholesalerSession();
  if (wholesalerUser) return { type: "wholesaler", user: wholesalerUser };

  return { type: "public" };
}
