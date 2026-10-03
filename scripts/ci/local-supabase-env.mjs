// Env for running the app against the LOCAL Supabase stack (`supabase start`).
//
// Nothing secret is committed: the URL and service-role key are read from the running stack via
// `supabase status -o env`, so they only exist while it is up.
//
//   import { localSupabaseEnv } from "./scripts/ci/local-supabase-env.mjs"
//   node scripts/ci/local-supabase-env.mjs >> "$GITHUB_ENV"   # in CI
import { execSync } from "node:child_process";

/** KEY="value" lines printed by `supabase status -o env`, as an object. */
function supabaseStatus() {
  const out = execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const status = {};
  for (const line of out.split(/\r?\n/)) {
    const match = /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim());
    if (match) status[match[1]] = match[2];
  }
  if (!status.SERVICE_ROLE_KEY) throw new Error("`supabase status` printed no SERVICE_ROLE_KEY; is `supabase start` running?");
  return status;
}

let cached;

export function localSupabaseEnv() {
  if (!cached) {
    const status = supabaseStatus();
    cached = {
      NEXT_PUBLIC_SUPABASE_URL: status.API_URL ?? "http://127.0.0.1:54321",
      SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
      AUTH_SECRET: "e2e-only-auth-secret-not-used-anywhere-real",
    };
  }
  return cached;
}

// Run directly (not imported): print KEY=value lines. Avoids import.meta, which Playwright's
// CommonJS transform of the test files can't load.
if (/local-supabase-env\.mjs$/.test(process.argv[1] ?? "")) {
  for (const [key, value] of Object.entries(localSupabaseEnv())) console.log(`${key}=${value}`);
}
