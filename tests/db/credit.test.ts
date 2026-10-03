import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { all, createTestDb, creditOf, resetDb, rpc, rpcError, seedShop, type TestDb } from "../helpers/db";

let db: TestDb;
let shop: Awaited<ReturnType<typeof seedShop>>;

beforeAll(async () => {
  db = await createTestDb();
});

beforeEach(async () => {
  await resetDb(db);
  shop = await seedShop(db);
});

describe("record_credit_payment", () => {
  const pay = (customerId: number, amount: number) => ({
    p_customer_id: customerId,
    p_amount: amount,
    p_user_id: shop.ownerId,
  });

  it("reduces the balance and records the payment", async () => {
    const customer = await shop.seed.customer(shop.branchId, { credit_balance: 500 });

    const [row] = await rpc<{ out_credit_balance: string }>(db, "record_credit_payment", pay(customer, 120.5));

    expect(Number(row.out_credit_balance)).toBe(379.5);
    expect(await creditOf(db, customer)).toBe(379.5);
    const payments = await all<{ customer_id: number; amount: string; user_id: number }>(
      db,
      "SELECT customer_id, amount, user_id FROM credit_payment",
    );
    expect(payments).toEqual([{ customer_id: customer, amount: "120.50", user_id: shop.ownerId }]);
  });

  it("allows paying off the exact balance", async () => {
    const customer = await shop.seed.customer(shop.branchId, { credit_balance: 80 });
    await rpc(db, "record_credit_payment", pay(customer, 80));
    expect(await creditOf(db, customer)).toBe(0);
  });

  it("rejects overpayment without changing anything", async () => {
    const customer = await shop.seed.customer(shop.branchId, { credit_balance: 80 });
    expect(await rpcError(db, "record_credit_payment", pay(customer, 80.01))).toMatch(/exceeds outstanding credit balance/);
    expect(await creditOf(db, customer)).toBe(80);
    expect(await all(db, "SELECT id FROM credit_payment")).toEqual([]);
  });

  it.each([0, -10])("rejects amount %d", async (amount) => {
    const customer = await shop.seed.customer(shop.branchId, { credit_balance: 80 });
    expect(await rpcError(db, "record_credit_payment", pay(customer, amount))).toMatch(/must be positive/);
  });

  it("rejects an unknown customer", async () => {
    expect(await rpcError(db, "record_credit_payment", pay(999, 10))).toMatch(/Customer not found/);
  });
});
