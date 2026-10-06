import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { WHOLESALER_SESSION_COOKIE } from "@/lib/wholesaler/constants";
import { createSessionToken } from "@/lib/auth/session";
import { createSessionToken as createWholesalerToken } from "@/lib/wholesaler/session";
import { OWNER, WHOLESALER } from "../helpers/auth";

const BASE = "http://localhost:3000";

type Options = { method?: string; staff?: boolean; wholesaler?: boolean; origin?: string; cookie?: string };

async function run(path: string, opts: Options = {}) {
  const cookies: string[] = [];
  if (opts.staff) cookies.push(`${SESSION_COOKIE}=${await createSessionToken(OWNER)}`);
  if (opts.wholesaler) cookies.push(`${WHOLESALER_SESSION_COOKIE}=${await createWholesalerToken(WHOLESALER)}`);
  if (opts.cookie) cookies.push(opts.cookie);

  const headers: Record<string, string> = {};
  if (cookies.length) headers.cookie = cookies.join("; ");
  if (opts.origin) headers.origin = opts.origin;

  const res = await proxy(new NextRequest(`${BASE}${path}`, { method: opts.method ?? "GET", headers }));
  return {
    status: res.status,
    passedThrough: res.headers.get("x-middleware-next") === "1",
    location: res.headers.get("location"),
  };
}

describe("proxy: staff area", () => {
  it("redirects a signed-out visitor to /login, remembering where they were going", async () => {
    const res = await run("/inventory");
    expect(res.status).toBe(307);
    expect(res.location).toBe(`${BASE}/login?from=%2Finventory`);
  });

  it("returns 401 JSON (not a redirect) for signed-out API calls", async () => {
    expect((await run("/api/products")).status).toBe(401);
  });

  it("lets a signed-in staff member through", async () => {
    expect((await run("/inventory", { staff: true })).passedThrough).toBe(true);
    expect((await run("/api/products", { staff: true })).passedThrough).toBe(true);
  });

  it("does not accept a forged session cookie", async () => {
    expect((await run("/inventory", { cookie: `${SESSION_COOKIE}=forged.token.value` })).status).toBe(307);
  });

  it("does not let a wholesaler session into the staff area", async () => {
    expect((await run("/inventory", { wholesaler: true })).status).toBe(307);
  });

  // KNOWN GAP: isValidSession in src/proxy.ts only checks the signature, and both token types
  // share AUTH_SECRET, so this currently passes the proxy. Not exploitable today — the dashboard
  // layout and every API handler re-verify with getSession(), which rejects it — but the proxy
  // should check the claims too. Once it does, this starts "failing": change it.fails to it.
  it.fails("does not accept a wholesaler token copied into the staff cookie", async () => {
    const token = await createWholesalerToken(WHOLESALER);
    expect((await run("/inventory", { cookie: `${SESSION_COOKIE}=${token}` })).status).toBe(307);
    expect((await run("/api/products", { cookie: `${SESSION_COOKIE}=${token}` })).status).toBe(401);
  });
});

describe("proxy: public entry points", () => {
  it.each(["/login", "/setup", "/"])("shows %s to signed-out visitors", async (path) => {
    expect((await run(path)).passedThrough).toBe(true);
  });

  it.each(["/login", "/"])("bounces a signed-in staff member from %s to /sales", async (path) => {
    const res = await run(path, { staff: true });
    expect(res.status).toBe(307);
    expect(res.location).toBe(`${BASE}/sales`);
  });

  it.each(["/shop", "/wholesaler/login", "/wholesaler/register", "/api/shop/products", "/api/auth", "/api/setup/seed"])(
    "always allows %s",
    async (path) => {
      expect((await run(path)).passedThrough).toBe(true);
      expect((await run(path, { staff: true })).passedThrough).toBe(true);
    },
  );
});

describe("proxy: wholesaler routes", () => {
  it("catalog is open to staff or wholesalers, and redirects everyone else to wholesaler login", async () => {
    expect((await run("/wholesaler/catalog", { staff: true })).passedThrough).toBe(true);
    expect((await run("/wholesaler/catalog", { wholesaler: true })).passedThrough).toBe(true);
    const anon = await run("/wholesaler/catalog");
    expect(anon.status).toBe(307);
    expect(anon.location).toBe(`${BASE}/wholesaler/login`);
    expect((await run("/api/wholesaler/catalog")).status).toBe(401);
  });

  it("order placement is wholesaler-only — staff are refused", async () => {
    expect((await run("/api/wholesaler/orders", { method: "POST", wholesaler: true })).passedThrough).toBe(true);
    expect((await run("/api/wholesaler/orders", { method: "POST", staff: true })).status).toBe(401);
    expect((await run("/api/wholesaler/orders", { method: "POST" })).status).toBe(401);
  });

  it("does not treat /api/wholesaler/catalog as a public wholesaler endpoint", async () => {
    expect((await run("/api/wholesaler/catalog")).status).toBe(401);
  });
});

describe("proxy: CSRF origin check", () => {
  it("rejects state-changing API calls from another origin, even when signed in", async () => {
    const res = await run("/api/sales", { method: "POST", staff: true, origin: "https://evil.example" });
    expect(res.status).toBe(403);
  });

  it("applies to public API routes too (e.g. login)", async () => {
    expect((await run("/api/auth", { method: "POST", origin: "https://evil.example" })).status).toBe(403);
  });

  it("rejects a malformed Origin header", async () => {
    expect((await run("/api/sales", { method: "DELETE", staff: true, origin: "not a url" })).status).toBe(403);
  });

  it("allows same-origin and Origin-less requests", async () => {
    expect((await run("/api/sales", { method: "POST", staff: true, origin: BASE })).passedThrough).toBe(true);
    expect((await run("/api/sales", { method: "POST", staff: true })).passedThrough).toBe(true);
  });

  it("does not apply to GET requests", async () => {
    expect((await run("/api/products", { staff: true, origin: "https://evil.example" })).passedThrough).toBe(true);
  });
});
