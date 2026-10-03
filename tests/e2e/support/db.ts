import postgres from "postgres";
import bcrypt from "bcryptjs";
import { E2E, assertLocalDatabase } from "./env";
import { BRANCH_NAME, SEED_USERS } from "./seed";

export type Sql = postgres.Sql;

export function connect(): Sql {
  assertLocalDatabase();
  return postgres(E2E.dbUrl, { max: 2, onnotice: () => {} });
}

/** Wipes every app table and creates the baseline branch + users. */
export async function resetAndSeed(sql: Sql) {
  const tables = await sql<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  await sql.unsafe(`TRUNCATE ${tables.map((t) => `public."${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);

  const [branch] = await sql<{ id: number }[]>`
    INSERT INTO branch (name, address) VALUES (${BRANCH_NAME}, 'Dhanmondi, Dhaka') RETURNING id`;
  for (const user of SEED_USERS) {
    await sql`
      INSERT INTO app_user (branch_id, name, role, pin_hash)
      VALUES (${branch.id}, ${user.name}, ${user.role}, ${await bcrypt.hash(user.pin, 4)})`;
  }
}

/** A short random suffix so data created by parallel tests never collides. */
export const uniq = (label: string) => `${label} ${Math.random().toString(36).slice(2, 7)}`;

/**
 * Factories for per-test data. Every product/customer gets a unique name, so tests can run in
 * parallel against the same database and find "their" rows unambiguously in the UI.
 */
export function factories(sql: Sql) {
  async function branchId() {
    const [row] = await sql<{ id: number }[]>`SELECT id FROM branch WHERE name = ${BRANCH_NAME}`;
    return row.id;
  }

  return {
    async product(opts: {
      name?: string;
      brand?: string;
      price?: number;
      wholesalePrice?: number | null;
      stock?: number;
      controlled?: boolean;
      expiry?: string | null;
    } = {}) {
      const name = opts.name ?? uniq("Paracetamol");
      const [product] = await sql<{ id: number }[]>`
        INSERT INTO product (generic_name, brand_name, sale_price, wholesale_price, is_controlled)
        VALUES (${name}, ${opts.brand ?? null}, ${opts.price ?? 2.5}, ${opts.wholesalePrice ?? null}, ${opts.controlled ?? false})
        RETURNING id`;
      if ((opts.stock ?? 0) > 0) {
        await sql`
          INSERT INTO batch (branch_id, product_id, quantity, expiry_date, cost_price)
          VALUES (${await branchId()}, ${product.id}, ${opts.stock!}, ${opts.expiry ?? "2028-12-31"}, 1)`;
      }
      return { id: product.id, name };
    },

    async customer(opts: { name?: string; phone?: string; credit?: number } = {}) {
      const name = opts.name ?? uniq("Karim");
      const [customer] = await sql<{ id: number }[]>`
        INSERT INTO customer (branch_id, name, phone, credit_balance)
        VALUES (${await branchId()}, ${name}, ${opts.phone ?? null}, ${opts.credit ?? 0})
        RETURNING id`;
      return { id: customer.id, name };
    },

    async stockOf(productId: number) {
      const [row] = await sql<{ total: number }[]>`
        SELECT COALESCE(SUM(quantity), 0)::int AS total FROM batch WHERE product_id = ${productId}`;
      return row.total;
    },

    async setStock(productId: number, quantity: number) {
      await sql`UPDATE batch SET quantity = ${quantity} WHERE product_id = ${productId}`;
    },

    async creditOf(customerId: number) {
      const [row] = await sql<{ credit_balance: string }[]>`
        SELECT credit_balance FROM customer WHERE id = ${customerId}`;
      return Number(row.credit_balance);
    },
  };
}

export type Factories = ReturnType<typeof factories>;
