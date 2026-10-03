// Env for running the app against the LOCAL Supabase stack (`supabase start`).
//
// The service-role key is derived, not committed: every local stack signs JWTs with the Supabase
// CLI's documented default secret (supabase/config.toml doesn't override it), so we sign the
// same service_role token here. It is worthless against any hosted project.
//
//   import { localSupabaseEnv } from "./scripts/ci/local-supabase-env.mjs"
//   node scripts/ci/local-supabase-env.mjs >> "$GITHUB_ENV"   # in CI
import { createHmac } from "node:crypto";

const LOCAL_JWT_SECRET = "super-secret-jwt-token-with-at-least-32-characters-long";

/** The service_role JWT `supabase start` accepts. */
export function localServiceRoleKey() {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ iss: "supabase-demo", role: "service_role", exp: 1983812996 })}`;
  return `${unsigned}.${createHmac("sha256", LOCAL_JWT_SECRET).update(unsigned).digest("base64url")}`;
}

export function localSupabaseEnv() {
  return {
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    SUPABASE_SERVICE_ROLE_KEY: localServiceRoleKey(),
    AUTH_SECRET: "e2e-only-auth-secret-not-used-anywhere-real",
  };
}

// Run directly (not imported): print KEY=value lines. Avoids import.meta, which Playwright's
// CommonJS transform of the test files can't load.
if (/local-supabase-env\.mjs$/.test(process.argv[1] ?? "")) {
  for (const [key, value] of Object.entries(localSupabaseEnv())) console.log(`${key}=${value}`);
}
