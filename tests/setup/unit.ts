import { beforeEach, vi } from "vitest";
import { clearCookies, cookieStore } from "../helpers/cookies";
import { currentSupabaseClient, mockSupabase } from "../helpers/supabase-mock";

process.env.AUTH_SECRET = "test-secret-at-least-32-characters-long!!";
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => currentSupabaseClient(),
}));

beforeEach(() => {
  clearCookies();
  mockSupabase();
});
