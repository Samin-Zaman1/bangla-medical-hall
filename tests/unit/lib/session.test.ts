import { afterEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";
import * as staff from "@/lib/auth/session";
import * as wholesaler from "@/lib/wholesaler/session";
import { getAuthContext } from "@/lib/wholesaler/request-context";
import { OWNER, STAFF, WHOLESALER, signInAs, signInAsWholesaler } from "../../helpers/auth";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET);

afterEach(() => {
  vi.useRealTimers();
});

describe("staff session tokens", () => {
  it("round-trips the session user", async () => {
    const token = await staff.createSessionToken(STAFF);
    expect(await staff.verifySessionToken(token)).toEqual(STAFF);
  });

  it("rejects a token signed with a different secret", async () => {
    const forged = await new SignJWT({ ...OWNER })
      .setProtectedHeader({ alg: "HS256" })
      .sign(new TextEncoder().encode("some-other-secret-that-is-long-enough"));
    expect(await staff.verifySessionToken(forged)).toBeNull();
  });

  it("rejects a tampered payload", async () => {
    const [header, , signature] = (await staff.createSessionToken(STAFF)).split(".");
    const promoted = Buffer.from(JSON.stringify({ ...STAFF, role: "owner" })).toString("base64url");
    expect(await staff.verifySessionToken(`${header}.${promoted}.${signature}`)).toBeNull();
  });

  it("rejects an expired token", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T08:00:00Z"));
    const token = await staff.createSessionToken(STAFF);
    vi.setSystemTime(new Date("2026-01-01T20:00:01Z")); // 12h shift + 1s
    expect(await staff.verifySessionToken(token)).toBeNull();
  });

  it.each([
    ["an unknown role", { ...STAFF, role: "admin" }],
    ["a string id", { ...STAFF, id: "2" }],
    ["a missing branch", { id: 2, name: "x", role: "staff" }],
  ])("rejects a validly signed token with %s", async (_label, payload) => {
    const token = await new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).sign(secret());
    expect(await staff.verifySessionToken(token)).toBeNull();
  });

  it("rejects garbage", async () => {
    expect(await staff.verifySessionToken("not-a-jwt")).toBeNull();
  });

  it("refuses to sign without AUTH_SECRET", async () => {
    vi.stubEnv("AUTH_SECRET", "");
    await expect(staff.createSessionToken(STAFF)).rejects.toThrow(/AUTH_SECRET/);
    vi.unstubAllEnvs();
  });

  it("cookie options are httpOnly, lax, and secure only in production", () => {
    expect(staff.sessionCookieOptions("t")).toMatchObject({ httpOnly: true, sameSite: "lax", secure: false, path: "/" });
    vi.stubEnv("NODE_ENV", "production");
    expect(staff.sessionCookieOptions("t").secure).toBe(true);
    vi.unstubAllEnvs();
    expect(staff.clearSessionCookieOptions()).toMatchObject({ value: "", maxAge: 0 });
  });
});

describe("wholesaler session tokens", () => {
  it("round-trips the wholesaler", async () => {
    const token = await wholesaler.createSessionToken(WHOLESALER);
    expect(await wholesaler.verifySessionToken(token)).toEqual(WHOLESALER);
  });

  // Both token types share AUTH_SECRET, so the `type` claim is what keeps them apart.
  it("a staff token is not accepted as a wholesaler session", async () => {
    expect(await wholesaler.verifySessionToken(await staff.createSessionToken(OWNER))).toBeNull();
  });

  it("a wholesaler token is not accepted as a staff session", async () => {
    expect(await staff.verifySessionToken(await wholesaler.createSessionToken(WHOLESALER))).toBeNull();
  });
});

describe("getAuthContext", () => {
  it("is public with no cookies", async () => {
    expect(await getAuthContext()).toEqual({ type: "public" });
  });

  it("identifies a wholesaler", async () => {
    await signInAsWholesaler();
    expect(await getAuthContext()).toEqual({ type: "wholesaler", user: WHOLESALER });
  });

  it("prefers the staff session when both cookies are present", async () => {
    await signInAsWholesaler();
    await signInAs(STAFF);
    expect(await getAuthContext()).toEqual({ type: "staff", user: STAFF });
  });
});

describe("password hashing", () => {
  it("verifies the right password and rejects the wrong one", async () => {
    const hash = await hashPassword("1234");
    expect(hash).not.toContain("1234");
    expect(await verifyPassword("1234", hash)).toBe(true);
    expect(await verifyPassword("1235", hash)).toBe(false);
  });
});
