import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  all,
  createTestDb,
  creditOf,
  one,
  quantityOf,
  resetDb,
  rpc,
  rpcError,
  seedShop,
  type TestDb,
} from "../helpers/db";

type SaleRow = { sale_id: number; subtotal: string; total_amount: string; receipt_number: string };

let db: TestDb;
let shop: Awaited<ReturnType<typeof seedShop>>;

beforeAll(async () => {
  db = await createTestDb();
});

beforeEach(async () => {
  await resetDb(db);
  shop = await seedShop(db);
});

function sell(items: { product_id: number; quantity: number }[], extra: Record<string, unknown> = {}) {
  return rpc<SaleRow>(db, "create_sale", {
    p_branch_id: shop.branchId,
    p_user_id: shop.staffId,
    p_items: items,
    p_customer_id: null,
    p_payment_method: "cash",
    p_discount_amount: 0,
    ...extra,
  });
}

function sellError(items: unknown, extra: Record<string, unknown> = {}) {
  return rpcError(db, "create_sale", {
    p_branch_id: shop.branchId,
    p_user_id: shop.staffId,
    p_items: items,
    p_customer_id: null,
    p_payment_method: "cash",
    p_discount_amount: 0,
    ...extra,
  });
}

const countRows = async (table: string) => Number((await one<{ n: string }>(db, `SELECT count(*) AS n FROM ${table}`)).n);

describe("create_sale", () => {
  it("records a multi-item bill as one sale with totals priced from the product table", async () => {
    const para = await shop.seed.product({ generic_name: "Paracetamol", sale_price: 2.5 });
    const omep = await shop.seed.product({ generic_name: "Omeprazole", sale_price: 7 });
    await shop.seed.batch(shop.branchId, para, 100);
    await shop.seed.batch(shop.branchId, omep, 100);

    const [sale] = await sell([
      { product_id: para, quantity: 4 },
      { product_id: omep, quantity: 2 },
    ]);

    expect(Number(sale.subtotal)).toBe(24);
    expect(Number(sale.total_amount)).toBe(24);
    expect(sale.receipt_number).toMatch(/^RCPT-\d{13}-\d+$/);

    const stored = await one(db, "SELECT * FROM sale WHERE id = $1", [sale.sale_id]);
    expect(stored).toMatchObject({ branch_id: shop.branchId, user_id: shop.staffId, payment_method: "cash" });
    expect(await countRows("sale")).toBe(1);
    expect(await countRows("sale_item")).toBe(2);
  });

  it("consumes stock earliest-expiry first and splits a line across batches", async () => {
    const product = await shop.seed.product();
    const late = await shop.seed.batch(shop.branchId, product, 10, { expiry_date: "2028-01-01" });
    const early = await shop.seed.batch(shop.branchId, product, 3, { expiry_date: "2026-12-01" });
    const noExpiry = await shop.seed.batch(shop.branchId, product, 10, { expiry_date: null });

    await sell([{ product_id: product, quantity: 5 }]);

    expect(await quantityOf(db, early)).toBe(0);
    expect(await quantityOf(db, late)).toBe(8);
    expect(await quantityOf(db, noExpiry)).toBe(10);

    const movements = await all(db, "SELECT batch_id, type, quantity, reason FROM stock_movement ORDER BY id");
    expect(movements).toEqual([
      { batch_id: early, type: "out", quantity: 3, reason: "sale" },
      { batch_id: late, type: "out", quantity: 2, reason: "sale" },
    ]);
  });

  it("merges the same product listed twice into one line", async () => {
    const product = await shop.seed.product({ sale_price: 1 });
    const batch = await shop.seed.batch(shop.branchId, product, 5);

    const [sale] = await sell([
      { product_id: product, quantity: 2 },
      { product_id: product, quantity: 3 },
    ]);

    expect(Number(sale.subtotal)).toBe(5);
    expect(await quantityOf(db, batch)).toBe(0);
  });

  it("rolls back the whole bill when any line is short of stock", async () => {
    const plenty = await shop.seed.product({ generic_name: "Plenty" });
    const scarce = await shop.seed.product({ generic_name: "Scarce" });
    const plentyBatch = await shop.seed.batch(shop.branchId, plenty, 50);
    await shop.seed.batch(shop.branchId, scarce, 1);

    const message = await sellError([
      { product_id: plenty, quantity: 10 },
      { product_id: scarce, quantity: 2 },
    ]);

    expect(message).toMatch(/Insufficient stock for Scarce \(need 2, have 1\)/);
    expect(await quantityOf(db, plentyBatch)).toBe(50);
    expect(await countRows("sale")).toBe(0);
    expect(await countRows("stock_movement")).toBe(0);
  });

  it("only sells stock held by the seller's own branch", async () => {
    const product = await shop.seed.product();
    const otherBranch = await shop.seed.branch({ name: "Other branch" });
    const otherBatch = await shop.seed.batch(otherBranch, product, 100);

    expect(await sellError([{ product_id: product, quantity: 1 }])).toMatch(/Insufficient stock/);
    expect(await quantityOf(db, otherBatch)).toBe(100);
  });

  it("ignores empty batches when choosing where to take stock from", async () => {
    const product = await shop.seed.product();
    await shop.seed.batch(shop.branchId, product, 0, { expiry_date: "2026-01-01" });
    const live = await shop.seed.batch(shop.branchId, product, 4, { expiry_date: "2027-01-01" });

    await sell([{ product_id: product, quantity: 4 }]);

    expect(await quantityOf(db, live)).toBe(0);
    expect(await countRows("sale_item")).toBe(1);
  });

  describe("discounts", () => {
    it("subtracts a flat discount and records who applied it", async () => {
      const product = await shop.seed.product({ sale_price: 10 });
      await shop.seed.batch(shop.branchId, product, 10);

      const [sale] = await sell([{ product_id: product, quantity: 3 }], { p_discount_amount: 5.5 });

      expect(Number(sale.subtotal)).toBe(30);
      expect(Number(sale.total_amount)).toBe(24.5);
      const stored = await one<{ discount_amount: string; discount_applied_by: number }>(
        db,
        "SELECT discount_amount, discount_applied_by FROM sale WHERE id = $1",
        [sale.sale_id],
      );
      expect(Number(stored.discount_amount)).toBe(5.5);
      expect(stored.discount_applied_by).toBe(shop.staffId);
    });

    it("leaves discount_applied_by empty when there is no discount", async () => {
      const product = await shop.seed.product();
      await shop.seed.batch(shop.branchId, product, 10);

      const [sale] = await sell([{ product_id: product, quantity: 1 }]);
      const stored = await one(db, "SELECT discount_applied_by FROM sale WHERE id = $1", [sale.sale_id]);
      expect(stored.discount_applied_by).toBeNull();
    });

    it("allows a discount equal to the subtotal (free sale)", async () => {
      const product = await shop.seed.product({ sale_price: 4 });
      await shop.seed.batch(shop.branchId, product, 10);

      const [sale] = await sell([{ product_id: product, quantity: 1 }], { p_discount_amount: 4 });
      expect(Number(sale.total_amount)).toBe(0);
    });

    it("rejects a discount larger than the subtotal and keeps stock", async () => {
      const product = await shop.seed.product({ sale_price: 4 });
      const batch = await shop.seed.batch(shop.branchId, product, 10);

      const message = await sellError([{ product_id: product, quantity: 1 }], { p_discount_amount: 4.01 });
      expect(message).toMatch(/Discount cannot exceed the subtotal/);
      expect(await quantityOf(db, batch)).toBe(10);
    });

    it("rejects a negative discount", async () => {
      const product = await shop.seed.product();
      await shop.seed.batch(shop.branchId, product, 10);
      expect(await sellError([{ product_id: product, quantity: 1 }], { p_discount_amount: -1 })).toMatch(
        /Discount cannot be negative/,
      );
    });
  });

  describe("credit (baki)", () => {
    it("adds the discounted total to the customer's balance", async () => {
      const product = await shop.seed.product({ sale_price: 10 });
      await shop.seed.batch(shop.branchId, product, 10);
      const customer = await shop.seed.customer(shop.branchId, { credit_balance: 100 });

      await sell([{ product_id: product, quantity: 2 }], {
        p_customer_id: customer,
        p_payment_method: "credit",
        p_discount_amount: 5,
      });

      expect(await creditOf(db, customer)).toBe(115);
    });

    it("does not touch the balance for a cash sale to a known customer", async () => {
      const product = await shop.seed.product({ sale_price: 10 });
      await shop.seed.batch(shop.branchId, product, 10);
      const customer = await shop.seed.customer(shop.branchId);

      await sell([{ product_id: product, quantity: 2 }], { p_customer_id: customer });

      expect(await creditOf(db, customer)).toBe(0);
    });

    it("requires a customer", async () => {
      const product = await shop.seed.product();
      await shop.seed.batch(shop.branchId, product, 10);
      expect(await sellError([{ product_id: product, quantity: 1 }], { p_payment_method: "credit" })).toMatch(
        /A customer is required for a credit sale/,
      );
    });

    it("rejects an unknown customer", async () => {
      const product = await shop.seed.product();
      await shop.seed.batch(shop.branchId, product, 10);
      expect(await sellError([{ product_id: product, quantity: 1 }], { p_customer_id: 999 })).toMatch(
        /Customer not found/,
      );
    });
  });

  it("logs controlled substances, one row per product with the total quantity", async () => {
    const controlled = await shop.seed.product({ generic_name: "Diazepam", is_controlled: true });
    const ordinary = await shop.seed.product({ generic_name: "Paracetamol" });
    await shop.seed.batch(shop.branchId, controlled, 2, { expiry_date: "2026-11-01" });
    await shop.seed.batch(shop.branchId, controlled, 10, { expiry_date: "2027-11-01" });
    await shop.seed.batch(shop.branchId, ordinary, 10);

    const [sale] = await sell([
      { product_id: controlled, quantity: 5 },
      { product_id: ordinary, quantity: 1 },
    ]);

    const log = await all(db, "SELECT sale_id, product_id, quantity FROM controlled_substance_log");
    expect(log).toEqual([{ sale_id: sale.sale_id, product_id: controlled, quantity: 5 }]);
  });

  it("gives back-to-back sales by the same user distinct receipt numbers", async () => {
    const product = await shop.seed.product();
    await shop.seed.batch(shop.branchId, product, 10);

    const receipts = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const [sale] = await sell([{ product_id: product, quantity: 1 }]);
      receipts.add(sale.receipt_number);
      // clock_timestamp() has microsecond resolution but receipts use milliseconds.
      await new Promise((r) => setTimeout(r, 2));
    }
    expect(receipts.size).toBe(3);
  });

  describe("input validation", () => {
    it.each([
      ["an empty bill", []],
      ["a non-array", { product_id: 1, quantity: 1 }],
    ])("rejects %s", async (_label, items) => {
      expect(await sellError(items)).toMatch(/at least one item/);
    });

    it.each([
      ["zero quantity", [{ product_id: 1, quantity: 0 }]],
      ["negative quantity", [{ product_id: 1, quantity: -2 }]],
      ["a missing quantity", [{ product_id: 1 }]],
      ["a missing product_id", [{ quantity: 1 }]],
    ])("rejects %s", async (_label, items) => {
      expect(await sellError(items)).toMatch(/Quantity must be a positive integer/);
    });

    it("rejects an unknown payment method", async () => {
      const product = await shop.seed.product();
      await shop.seed.batch(shop.branchId, product, 10);
      expect(await sellError([{ product_id: product, quantity: 1 }], { p_payment_method: "card" })).toMatch(
        /Invalid payment method/,
      );
    });

    it("rejects an unknown product and names it", async () => {
      expect(await sellError([{ product_id: 4242, quantity: 1 }])).toMatch(/Product not found \(id 4242\)/);
      expect(await countRows("sale")).toBe(0);
    });
  });
});
