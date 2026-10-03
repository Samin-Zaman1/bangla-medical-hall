/**
 * Where the E2E suite points. Defaults target the local Supabase stack (`npx supabase start`)
 * and a Next server on :3100, so `npm run test:e2e` works with no configuration.
 *
 * Setting E2E_BASE_URL switches to "remote" mode: only the read-only @smoke project runs, no
 * server is started and the database is never touched. That is how the deploy pipeline checks
 * production.
 */

import { localSupabaseEnv } from "../../../scripts/ci/local-supabase-env.mjs";

export const remoteTarget = process.env.E2E_BASE_URL;

// Read from the running local stack (scripts/ci/local-supabase-env.mjs), only when no override
// is set. Remote mode has no local stack, so it must never be asked.
const local = <K extends keyof ReturnType<typeof localSupabaseEnv>>(key: K) =>
  remoteTarget ? "" : localSupabaseEnv()[key];

export const E2E = {
  port: 3100,
  baseURL: remoteTarget ?? "http://localhost:3100",
  supabaseUrl: process.env.E2E_SUPABASE_URL ?? local("NEXT_PUBLIC_SUPABASE_URL"),
  serviceRoleKey: process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? local("SUPABASE_SERVICE_ROLE_KEY"),
  dbUrl: process.env.E2E_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  authSecret: process.env.E2E_AUTH_SECRET ?? local("AUTH_SECRET"),
};

/** Env for the Next server under test. Overrides anything in .env.local (process env wins). */
export function appServerEnv(): Record<string, string> {
  return {
    NEXT_PUBLIC_SUPABASE_URL: E2E.supabaseUrl,
    SUPABASE_SERVICE_ROLE_KEY: E2E.serviceRoleKey,
    AUTH_SECRET: E2E.authSecret,
    NEXT_TELEMETRY_DISABLED: "1",
  };
}

/**
 * The suite truncates every table. Refuse to run against anything but a local database, so a
 * stray production URL in the environment can never be wiped.
 */
export function assertLocalDatabase() {
  for (const url of [E2E.dbUrl, E2E.supabaseUrl]) {
    const host = new URL(url).hostname;
    if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host)) {
      throw new Error(
        `Refusing to run E2E against non-local database host "${host}". ` +
          "The suite resets all data; point E2E_DB_URL / E2E_SUPABASE_URL at `supabase start`.",
      );
    }
  }
}
