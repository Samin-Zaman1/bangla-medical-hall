import { beforeAll, describe, expect, it } from "vitest";
import { all, createTestDb, type TestDb } from "../helpers/db";

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});

describe("migrations", () => {
  it("leave exactly one create_sale overload, the multi-item one", async () => {
    const overloads = await all<{ args: string }>(
      db,
      `SELECT pg_get_function_identity_arguments(p.oid) AS args
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'create_sale'`,
    );
    expect(overloads).toEqual([
      {
        args: "p_branch_id integer, p_user_id integer, p_items jsonb, p_customer_id integer, p_payment_method text, p_discount_amount numeric",
      },
    ]);
  });

  it("grant service_role EXECUTE on every RPC the app calls", async () => {
    const rpcs = [
      "create_sale",
      "create_batch",
      "adjust_batch_quantity",
      "create_purchase_order",
      "mark_purchase_delivered",
      "create_wholesale_order",
      "prepare_wholesale_order",
      "mark_wholesale_order_paid",
      "create_wholesaler_order",
      "fulfill_wholesaler_order",
      "confirm_purchase_invoice",
      "record_credit_payment",
    ];
    const rows = await all<{ proname: string; can_execute: boolean }>(
      db,
      `SELECT p.proname, has_function_privilege('service_role', p.oid, 'EXECUTE') AS can_execute
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = ANY($1)`,
      [rpcs],
    );
    expect(rows.map((r) => r.proname).sort()).toEqual([...rpcs].sort());
    expect(rows.filter((r) => !r.can_execute)).toEqual([]);
  });

  // Supabase exposes every public table over its REST API, and its default grants let the anon
  // key read new tables. RLS with no policies is what locks them down (see 003_enable_rls.sql),
  // so a table without it is readable by anyone holding the public anon key.
  it("enable row level security on every table the anon role can read", async () => {
    const rows = await all<{ relname: string }>(
      db,
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'
         AND has_table_privilege('anon', c.oid, 'SELECT')
         AND NOT c.relrowsecurity
       ORDER BY c.relname`,
    );
    expect(rows.map((r) => r.relname)).toEqual([]);
  });
});
