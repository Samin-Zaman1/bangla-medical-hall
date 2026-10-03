import { beforeAll, describe, expect, it } from "vitest";
import { DELETE, GET, POST } from "@/app/api/auth/route";
import { GET as listUsers } from "@/app/api/auth/users/route";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { hashPassword } from "@/lib/auth/password";
import { verifySessionToken } from "@/lib/auth/session";
import { STAFF, signInAs } from "../../helpers/auth";
import { getSetCookie } from "../../helpers/cookies";
import { post, readJson } from "../../helpers/http";
import { mockSupabase, pgError } from "../../helpers/supabase-mock";

let pinHash: string;

beforeAll(async () => {
  pinHash = await hashPassword("2468");
});

// The lockout map lives at module scope and survives between tests, so every test that can
// record a failed attempt uses its own user id.
function userRow(id: number, overrides: Record<string, unknown> = {}) {
  return { id, branch_id: 1, name: "Rina", role: "staff", pin_hash: pinHash, ...overrides };
}

const login = async (body: unknown) => readJson(await POST(post("/api/auth", body)));

describe("POST /api/auth (PIN login)", () => {
  it("signs in with the right PIN and sets an httpOnly session cookie", async () => {
    mockSupabase().onTable("app_user", { data: userRow(10) });

    const res = await login({ userId: 10, pin: " 2468 " });

    expect(res).toEqual({ status: 200, body: { user: { id: 10, branchId: 1, name: "Rina", role: "staff" } } });
    const cookie = getSetCookie(SESSION_COOKIE);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "lax" });
    expect(await verifySessionToken(cookie!.value)).toEqual({ id: 10, branchId: 1, name: "Rina", role: "staff" });
  });

  it("rejects a wrong PIN without setting a cookie", async () => {
    mockSupabase().onTable("app_user", { data: userRow(11) });
    expect(await login({ userId: 11, pin: "0000" })).toEqual({ status: 401, body: { error: "Invalid credentials" } });
    expect(getSetCookie(SESSION_COOKIE)).toBeUndefined();
  });

  it("gives the same answer for an unknown user as for a wrong PIN", async () => {
    mockSupabase().onTable("app_user", { data: null });
    expect(await login({ userId: 404, pin: "2468" })).toEqual({ status: 401, body: { error: "Invalid credentials" } });
  });

  it("refuses users without a branch (cannot build a session)", async () => {
    mockSupabase().onTable("app_user", { data: userRow(12, { branch_id: null }) });
    expect((await login({ userId: 12, pin: "2468" })).status).toBe(401);
  });

  it("treats a lookup error as invalid credentials, not a 500 that leaks details", async () => {
    mockSupabase().onTable("app_user", pgError("relation app_user does not exist"));
    expect(await login({ userId: 13, pin: "2468" })).toEqual({ status: 401, body: { error: "Invalid credentials" } });
  });

  it.each([
    ["malformed JSON", "{"],
    ["no PIN", { userId: 1 }],
    ["a blank PIN", { userId: 1, pin: "   " }],
    ["no user", { pin: "2468" }],
  ])("400s on %s", async (_label, body) => {
    expect((await login(body)).status).toBe(400);
  });

  it("locks the account for 5 minutes after 5 wrong PINs — even for the right PIN", async () => {
    const sb = mockSupabase();
    for (let i = 0; i < 7; i++) sb.onTable("app_user", { data: userRow(20) });

    for (let i = 0; i < 5; i++) {
      expect((await login({ userId: 20, pin: "0000" })).status).toBe(401);
    }
    expect((await login({ userId: 20, pin: "0000" })).status).toBe(429);
    expect((await login({ userId: 20, pin: "2468" })).status).toBe(429);
  });

  it("a successful login resets the failure count", async () => {
    const sb = mockSupabase();
    for (let i = 0; i < 10; i++) sb.onTable("app_user", { data: userRow(21) });

    for (let i = 0; i < 4; i++) await login({ userId: 21, pin: "0000" });
    expect((await login({ userId: 21, pin: "2468" })).status).toBe(200);
    for (let i = 0; i < 4; i++) {
      expect((await login({ userId: 21, pin: "0000" })).status).toBe(401);
    }
  });

  it("lockout is per user", async () => {
    const sb = mockSupabase();
    for (let i = 0; i < 6; i++) sb.onTable("app_user", { data: userRow(22) });
    for (let i = 0; i < 6; i++) await login({ userId: 22, pin: "0000" });

    sb.onTable("app_user", { data: userRow(23) });
    expect((await login({ userId: 23, pin: "2468" })).status).toBe(200);
  });
});

describe("GET /api/auth", () => {
  it("returns the current user", async () => {
    await signInAs(STAFF);
    expect(await readJson(await GET())).toEqual({ status: 200, body: { user: STAFF } });
  });

  it("401s when signed out", async () => {
    expect((await GET()).status).toBe(401);
  });
});

describe("DELETE /api/auth (logout)", () => {
  it("clears the session cookie", async () => {
    await signInAs(STAFF);
    expect((await DELETE()).status).toBe(200);
    expect(getSetCookie(SESSION_COOKIE)).toMatchObject({ value: "", maxAge: 0 });
  });
});

describe("GET /api/auth/users (login picker)", () => {
  it("lists only id, name and role — never PIN hashes", async () => {
    const sb = mockSupabase();
    sb.onTable("app_user", { data: [{ id: 1, name: "Owner", role: "owner" }] });

    expect(await readJson(await listUsers())).toEqual({
      status: 200,
      body: { users: [{ id: 1, name: "Owner", role: "owner" }] },
    });
    const select = sb.tableCalls("app_user")[0].chain.find((c) => c.method === "select");
    expect(select?.args[0]).toBe("id, name, role");
  });
});
