// Env for running the app against the LOCAL Supabase stack (`supabase start`).
//
// Nothing secret is committed. Auth is disabled in supabase/config.toml, so `supabase status`
// prints no API keys; instead we read the HMAC key PostgREST verifies tokens with from its
// running container and sign a service_role token with it. The key only exists while the stack
// is up and is worthless against any hosted project.
//
//   import { localSupabaseEnv } from "./scripts/ci/local-supabase-env.mjs"
//   node scripts/ci/local-supabase-env.mjs >> "$GITHUB_ENV"   # in CI
import { createHmac } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** The HS256 key the local PostgREST container accepts. */
function stackJwtKey() {
  const projectId = /^project_id\s*=\s*"([^"]+)"/m.exec(readFileSync("supabase/config.toml", "utf8"))?.[1];
  let env;
  try {
    env = JSON.parse(
      execSync(`docker inspect supabase_rest_${projectId} --format "{{json .Config.Env}}"`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
  } catch {
    throw new Error("Local Supabase isn't running. Start it with `npm run db:local:start`.");
  }
  const secret = env.find((line) => line.startsWith("PGRST_JWT_SECRET="))?.slice("PGRST_JWT_SECRET=".length);
  if (!secret) throw new Error("PostgREST container has no PGRST_JWT_SECRET");
  // Newer CLIs pass a JWKS (asymmetric key + the legacy HMAC key); older ones the plain secret.
  if (!secret.startsWith("{")) return Buffer.from(secret);
  const hmac = JSON.parse(secret).keys?.find((key) => key.kty === "oct");
  if (!hmac) throw new Error("PostgREST JWKS has no HMAC (oct) key");
  return Buffer.from(hmac.k, "base64url");
}

function serviceRoleKey() {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;
  const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ iss: "supabase-demo", role: "service_role", exp })}`;
  return `${unsigned}.${createHmac("sha256", stackJwtKey()).update(unsigned).digest("base64url")}`;
}

let cached;

export function localSupabaseEnv() {
  cached ??= {
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey(),
    AUTH_SECRET: "e2e-only-auth-secret-not-used-anywhere-real",
  };
  return cached;
}

// Run directly (not imported): print KEY=value lines. Avoids import.meta, which Playwright's
// CommonJS transform of the test files can't load.
if (/local-supabase-env\.mjs$/.test(process.argv[1] ?? "")) {
  for (const [key, value] of Object.entries(localSupabaseEnv())) console.log(`${key}=${value}`);
}
