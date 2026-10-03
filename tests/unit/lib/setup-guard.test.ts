import { afterEach, describe, expect, it, vi } from "vitest";
import { checkSetupAllowed, hasExistingUsers } from "@/lib/setup-guard";
import { mockSupabase, pgError } from "../../helpers/supabase-mock";

afterEach(() => {
  vi.unstubAllEnvs();
});

const request = (secret?: string) =>
  new Request("http://localhost/api/setup/seed", { headers: secret ? { "x-setup-secret": secret } : {} });

describe("checkSetupAllowed", () => {
  it("allows setup outside production", () => {
    expect(checkSetupAllowed(request())).toBeNull();
  });

  it("blocks setup in production without the secret", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SETUP_SECRET", "s3cret");
    const res = checkSetupAllowed(request("wrong"));
    expect(res?.status).toBe(403);
  });

  it("allows setup in production with the matching secret", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SETUP_SECRET", "s3cret");
    expect(checkSetupAllowed(request("s3cret"))).toBeNull();
  });

  it("stays blocked in production when SETUP_SECRET is unset, even if the header is empty", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SETUP_SECRET", "");
    expect(checkSetupAllowed(request(""))?.status).toBe(403);
  });
});

describe("hasExistingUsers", () => {
  it("is false for an empty app_user table", async () => {
    mockSupabase().onTable("app_user", { count: 0 });
    expect(await hasExistingUsers()).toBe(false);
  });

  it("is true once a user exists", async () => {
    mockSupabase().onTable("app_user", { count: 1 });
    expect(await hasExistingUsers()).toBe(true);
  });

  it("surfaces the underlying Supabase error", async () => {
    mockSupabase().onTable("app_user", pgError("permission denied for table app_user"));
    await expect(hasExistingUsers()).rejects.toThrow(/permission denied for table app_user/);
  });
});
