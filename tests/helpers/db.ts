import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");

// What every Supabase project has before our migrations run: the API roles, the storage schema,
// and Supabase's default grants — new public tables/functions are accessible to anon,
// authenticated and service_role unless RLS (or a REVOKE) says otherwise.
const SUPABASE_PRELUDE = `
  CREATE ROLE service_role;
  CREATE ROLE anon;
  CREATE ROLE authenticated;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
  CREATE SCHEMA storage;
  CREATE TABLE storage.buckets (id TEXT PRIMARY KEY, name TEXT NOT NULL, public BOOLEAN DEFAULT false);
`;

export type TestDb = PGlite;

/** A fresh in-process Postgres with every migration in supabase/migrations applied in order. */
export async function createTestDb(): Promise<TestDb> {
  const db = await PGlite.create();
  await db.exec(SUPABASE_PRELUDE);
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    try {
      await db.exec(readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
    } catch (err) {
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`, { cause: err });
    }
  }
  return db;
}

/** Empties every app table and resets ids, so each test starts from a blank database. */
export async function resetDb(db: TestDb) {
  const { rows } = await db.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
  );
  const tables = rows.map((r) => `public.${r.tablename}`).join(", ");
  await db.exec(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
}

/**
 * Calls a function with named arguments — the same `{ p_name: value }` object the routes pass
 * to `supabase.rpc()` — so a renamed or retyped parameter fails here just as it would in prod.
 * Objects/arrays are sent as JSON (for JSONB parameters).
 */
export async function rpc<T = Record<string, unknown>>(
  db: TestDb,
  fn: string,
  args: Record<string, unknown>,
): Promise<T[]> {
  const names = Object.keys(args);
  const values = names.map((n) => {
    const v = args[n];
    return v !== null && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v;
  });
  const argList = names.map((n, i) => `${n} => $${i + 1}`).join(", ");
  const { rows } = await db.query<T>(`SELECT * FROM public.${fn}(${argList})`, values);
  return rows;
}

/** Runs an RPC expected to fail and returns the Postgres error message. */
export async function rpcError(db: TestDb, fn: string, args: Record<string, unknown>): Promise<string> {
  try {
    await rpc(db, fn, args);
  } catch (err) {
    return (err as Error).message;
  }
  throw new Error(`Expected ${fn} to raise an error, but it succeeded`);
}

export async function one<T = Record<string, unknown>>(db: TestDb, sql: string, params: unknown[] = []) {
  const { rows } = await db.query<T>(sql, params);
  return rows[0];
}

export async function all<T = Record<string, unknown>>(db: TestDb, sql: string, params: unknown[] = []) {
  const { rows } = await db.query<T>(sql, params);
  return rows;
}

// ---------------------------------------------------------------------------
// Seed builders — each inserts one row with sensible defaults and returns its id.
// ---------------------------------------------------------------------------

async function insert(db: TestDb, table: string, values: Record<string, unknown>): Promise<number> {
  const cols = Object.keys(values);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  const row = await one<{ id: number }>(
    db,
    `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders}) RETURNING id`,
    Object.values(values),
  );
  return row.id;
}

export function seeder(db: TestDb) {
  return {
    branch: (v: Record<string, unknown> = {}) => insert(db, "branch", { name: "Main branch", ...v }),
    user: (branchId: number, v: Record<string, unknown> = {}) =>
      insert(db, "app_user", { branch_id: branchId, name: "Staff", role: "staff", pin_hash: "x", ...v }),
    customer: (branchId: number, v: Record<string, unknown> = {}) =>
      insert(db, "customer", { branch_id: branchId, name: "Karim", ...v }),
    supplier: (v: Record<string, unknown> = {}) => insert(db, "supplier", { name: "Square Pharma", ...v }),
    product: (v: Record<string, unknown> = {}) =>
      insert(db, "product", { generic_name: "Paracetamol", sale_price: 2, ...v }),
    batch: (branchId: number, productId: number, quantity: number, v: Record<string, unknown> = {}) =>
      insert(db, "batch", { branch_id: branchId, product_id: productId, quantity, ...v }),
    wholesaler: (v: Record<string, unknown> = {}) =>
      insert(db, "wholesaler", { shop_name: "Rahim Pharma", email: `w${Math.random()}@example.com`, password_hash: "x", ...v }),
  };
}

/** A branch with one owner and one staff user — the starting point for most RPC tests. */
export async function seedShop(db: TestDb) {
  const seed = seeder(db);
  const branchId = await seed.branch();
  const ownerId = await seed.user(branchId, { name: "Owner", role: "owner" });
  const staffId = await seed.user(branchId, { name: "Staff", role: "staff" });
  return { seed, branchId, ownerId, staffId };
}

export const quantityOf = async (db: TestDb, batchId: number) =>
  (await one<{ quantity: number }>(db, "SELECT quantity FROM batch WHERE id = $1", [batchId])).quantity;

export const creditOf = async (db: TestDb, customerId: number) =>
  Number((await one<{ credit_balance: string }>(db, "SELECT credit_balance FROM customer WHERE id = $1", [customerId])).credit_balance);
