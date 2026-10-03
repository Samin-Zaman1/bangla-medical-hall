import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { WHOLESALER_SESSION_COOKIE } from "@/lib/wholesaler/constants";

// Pre-auth entry points: an authenticated staff user gets bounced to /sales instead of seeing
// these (see the PUBLIC_PATHS branch below) — that's the right behavior for a login page.
const PUBLIC_PATHS = ["/login", "/setup", "/"];
// Only the wholesaler routes that must work for a signed-out visitor. Deliberately NOT a broad
// "/api/wholesaler" prefix — /api/wholesaler/catalog needs the opposite treatment (see
// WHOLESALER_PROTECTED_API_PREFIXES below), so it must not match here.
const PUBLIC_API_PREFIXES = ["/api/auth", "/api/setup", "/api/wholesaler/register", "/api/wholesaler/login", "/api/shop"];
// Public storefront pages — unlike PUBLIC_PATHS, these must NOT redirect an authenticated
// staff user away; a logged-in staff member is allowed to browse /shop like anyone else.
// Wholesaler login/register also live here: the "redirect away if already signed in" logic
// for those is handled inside the page components themselves (via getAuthContext()), since it
// needs to check both cookie types and pick a different destination than PUBLIC_PATHS' /sales.
const ALWAYS_PUBLIC_PATHS = ["/shop", "/wholesaler/login", "/wholesaler/register"];
// Requires EITHER a valid staff session OR a valid wholesaler session — not staff-only like the
// default fallback below, and not public like the lists above.
const WHOLESALER_PROTECTED_PATHS = ["/wholesaler/catalog"];
const WHOLESALER_PROTECTED_API_PREFIXES = ["/api/wholesaler/catalog"];
// Requires a wholesaler session specifically — staff must NOT pass here. Order submission is
// tied to the authenticated wholesaler's own id; there's no notion of a staff member placing an
// order "as" a wholesaler.
const WHOLESALER_ONLY_API_PREFIXES = ["/api/wholesaler/orders"];
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Defense-in-depth against CSRF: reject state-changing requests whose Origin header (when
// present) doesn't match this app's own host. Cookies alone (even SameSite=lax) aren't a
// complete guard for POST/DELETE, so this backstops the session cookie check.
function isTrustedOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}

function getSecretKey(): Uint8Array | null {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

// Both session checks look at claims, not just the signature: staff and wholesaler tokens share
// AUTH_SECRET, so either kind verifies against it. A staff token has an owner/staff `role` and
// no `type`; a wholesaler token has `type: "wholesaler"`.
async function isValidSession(token: string): Promise<boolean> {
  const secret = getSecretKey();
  if (!secret) return false;
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload.type === undefined && (payload.role === "owner" || payload.role === "staff");
  } catch {
    return false;
  }
}

async function isValidWholesalerSession(token: string): Promise<boolean> {
  const secret = getSecretKey();
  if (!secret) return false;
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload.type === "wholesaler";
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/api") &&
    UNSAFE_METHODS.has(request.method) &&
    !isTrustedOrigin(request)
  ) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    ALWAYS_PUBLIC_PATHS.includes(pathname)
  ) {
    return NextResponse.next();
  }

  const isWholesalerOnlyRoute = WHOLESALER_ONLY_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (isWholesalerOnlyRoute) {
    const wholesalerToken = request.cookies.get(WHOLESALER_SESSION_COOKIE)?.value;
    const allowed = wholesalerToken ? await isValidWholesalerSession(wholesalerToken) : false;
    if (!allowed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  const isWholesalerRoute =
    WHOLESALER_PROTECTED_PATHS.includes(pathname) ||
    WHOLESALER_PROTECTED_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (isWholesalerRoute) {
    const staffToken = request.cookies.get(SESSION_COOKIE)?.value;
    const wholesalerToken = request.cookies.get(WHOLESALER_SESSION_COOKIE)?.value;

    const allowed =
      (staffToken ? await isValidSession(staffToken) : false) ||
      (wholesalerToken ? await isValidWholesalerSession(wholesalerToken) : false);

    if (!allowed) {
      if (pathname.startsWith("/api")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.redirect(new URL("/wholesaler/login", request.url));
    }
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const authenticated = token ? await isValidSession(token) : false;
  const isApiRoute = pathname.startsWith("/api");

  if (PUBLIC_PATHS.includes(pathname)) {
    if (authenticated) {
      return NextResponse.redirect(new URL("/sales", request.url));
    }
    return NextResponse.next();
  }

  if (!authenticated) {
    if (isApiRoute) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"],
};
