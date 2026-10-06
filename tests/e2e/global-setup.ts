import { connect, resetAndSeed } from "./support/db";

/** Runs once per `playwright test` invocation: a clean, known database for every run. */
export default async function globalSetup() {
  const sql = connect();
  try {
    await resetAndSeed(sql);
  } catch (err) {
    throw new Error(
      `Could not reset the E2E database. Is the local Supabase stack running (npx supabase start)?\n${(err as Error).message}`,
      { cause: err },
    );
  } finally {
    await sql.end();
  }
}
