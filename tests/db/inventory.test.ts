import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { all, createTestDb, one, quantityOf, resetDb, rpc, rpcError, seedShop, type TestDb } from "../helpers/db";

let db: TestDb;
let shop: Awaited<ReturnType<typeof seedShop>>;

beforeAll(async () => {
  db = await createTestDb();
});

beforeEach(async () => {
  await resetDb(db);
  shop = await seedShop(db);
});

describe("create_batch", () => {
  const args = (productId: number, quantity: number) => ({
    p_branch_id: shop.branchId,
    p_product_id: productId,
    p_quantity: quantity,
    p_batch_number: "BN-1",
    p_expiry_date: "2027-06-30",
    p_cost_price: 1.25,
    p_supplier_id: null,
    p_user_id: shop.ownerId,
  });

  it("creates the batch and logs an 'in' movement", async () => {
    const product = await shop.seed.product();
    const [row] = await rpc<{ batch_id: number; quantity: number }>(db, "create_batch", args(product, 40));

    expect(row.quantity).toBe(40);
    expect(await quantityOf(db, row.batch_id)).toBe(40);
    expect(await all(db, "SELECT batch_id, type, quantity, reason, user_id FROM stock_movement")).toEqual([
      { batch_id: row.batch_id, type: "in", quantity: 40, reason: "batch_created", user_id: shop.ownerId },
    ]);
  });

  it.each([0, -5])("rejects quantity %i", async (quantity) => {
    const product = await shop.seed.product();
    expect(await rpcError(db, "create_batch", args(product, quantity))).toMatch(/Quantity must be a positive integer/);
  });

  it("rejects an unknown product", async () => {
    expect(await rpcError(db, "create_batch", args(999, 1))).toMatch(/Product not found/);
  });
});

describe("adjust_batch_quantity", () => {
  const adjust = (batchId: number, delta: number, branchId = shop.branchId) => ({
    p_batch_id: batchId,
    p_branch_id: branchId,
    p_quantity_delta: delta,
    p_reason: "damaged",
    p_user_id: shop.ownerId,
  });

  it("applies a negative adjustment and logs it", async () => {
    const batch = await shop.seed.batch(shop.branchId, await shop.seed.product(), 10);
    const [row] = await rpc<{ quantity: number }>(db, "adjust_batch_quantity", adjust(batch, -3));

    expect(row.quantity).toBe(7);
    expect(await quantityOf(db, batch)).toBe(7);
    expect(await one(db, "SELECT type, quantity, reason FROM stock_movement")).toEqual({
      type: "adjustment",
      quantity: -3,
      reason: "damaged",
    });
  });

  it("allows adjusting down to exactly zero but not below", async () => {
    const batch = await shop.seed.batch(shop.branchId, await shop.seed.product(), 5);
    expect(await rpcError(db, "adjust_batch_quantity", adjust(batch, -6))).toMatch(/negative stock/);
    await rpc(db, "adjust_batch_quantity", adjust(batch, -5));
    expect(await quantityOf(db, batch)).toBe(0);
  });

  it("rejects a zero delta", async () => {
    const batch = await shop.seed.batch(shop.branchId, await shop.seed.product(), 5);
    expect(await rpcError(db, "adjust_batch_quantity", adjust(batch, 0))).toMatch(/non-zero/);
  });

  it("cannot touch another branch's batch", async () => {
    const otherBranch = await shop.seed.branch({ name: "Other" });
    const batch = await shop.seed.batch(otherBranch, await shop.seed.product(), 5);

    expect(await rpcError(db, "adjust_batch_quantity", adjust(batch, -1))).toMatch(/Batch not found/);
    expect(await quantityOf(db, batch)).toBe(5);
  });
});

describe("supplier purchase orders", () => {
  async function catalogued() {
    const supplier = await shop.seed.supplier();
    const product = await shop.seed.product();
    await db.query("INSERT INTO supplier_product (supplier_id, product_id, cost_price) VALUES ($1, $2, 1.50)", [
      supplier,
      product,
    ]);
    return { supplier, product };
  }

  const order = (supplier: number, items: unknown) => ({
    p_branch_id: shop.branchId,
    p_supplier_id: supplier,
    p_user_id: shop.ownerId,
    p_items: items,
  });

  it("creates a pending order, defaulting to the catalog cost price", async () => {
    const { supplier, product } = await catalogued();
    const other = await shop.seed.product({ generic_name: "Other" });
    await db.query("INSERT INTO supplier_product (supplier_id, product_id, cost_price) VALUES ($1, $2, 3)", [
      supplier,
      other,
    ]);

    const [row] = await rpc<{ out_purchase_id: number; out_total_amount: string }>(
      db,
      "create_purchase_order",
      order(supplier, [
        { product_id: product, quantity: 10 },
        { product_id: other, quantity: 2, cost_price: 2.5 },
      ]),
    );

    expect(Number(row.out_total_amount)).toBe(20);
    expect(await one(db, "SELECT order_status, payment_status FROM purchase WHERE id = $1", [row.out_purchase_id])).toEqual({
      order_status: "pending",
      payment_status: "due",
    });
  });

  it("rejects products the supplier doesn't carry, creating nothing", async () => {
    const { supplier } = await catalogued();
    const uncatalogued = await shop.seed.product({ generic_name: "Elsewhere" });

    expect(await rpcError(db, "create_purchase_order", order(supplier, [{ product_id: uncatalogued, quantity: 1 }]))).toMatch(
      /not in this supplier's catalog/,
    );
    expect(await all(db, "SELECT id FROM purchase")).toEqual([]);
  });

  it("marking delivered creates one batch per line and adds stock", async () => {
    const { supplier, product } = await catalogued();
    const [po] = await rpc<{ out_purchase_id: number }>(
      db,
      "create_purchase_order",
      order(supplier, [{ product_id: product, quantity: 12 }]),
    );
    const item = await one<{ id: number }>(db, "SELECT id FROM purchase_item WHERE purchase_id = $1", [po.out_purchase_id]);

    await rpc(db, "mark_purchase_delivered", {
      p_purchase_id: po.out_purchase_id,
      p_branch_id: shop.branchId,
      p_user_id: shop.ownerId,
      p_batch_overrides: [{ purchase_item_id: item.id, batch_number: "LOT-9", expiry_date: "2027-03-01" }],
    });

    const batch = await one(db, "SELECT product_id, supplier_id, batch_number, quantity, cost_price FROM batch");
    expect(batch).toMatchObject({ product_id: product, supplier_id: supplier, batch_number: "LOT-9", quantity: 12 });
    expect(Number(batch.cost_price)).toBe(1.5);
    expect(await one(db, "SELECT order_status FROM purchase")).toEqual({ order_status: "delivered" });

    // A second delivery would double the stock — must be refused.
    expect(
      await rpcError(db, "mark_purchase_delivered", {
        p_purchase_id: po.out_purchase_id,
        p_branch_id: shop.branchId,
        p_user_id: shop.ownerId,
        p_batch_overrides: null,
      }),
    ).toMatch(/not pending/);
    expect(await all(db, "SELECT id FROM batch")).toHaveLength(1);
  });
});

describe("confirm_purchase_invoice", () => {
  async function draftInvoice(items: { product_id: number | null; raw: string; quantity: number }[]) {
    const invoice = await one<{ id: number }>(
      db,
      "INSERT INTO purchase_invoice (branch_id, invoice_image_url, created_by) VALUES ($1, 'x.jpg', $2) RETURNING id",
      [shop.branchId, shop.ownerId],
    );
    for (const item of items) {
      await db.query(
        "INSERT INTO purchase_invoice_item (purchase_invoice_id, product_id, raw_extracted_name, quantity, unit_cost) VALUES ($1, $2, $3, $4, 2)",
        [invoice.id, item.product_id, item.raw, item.quantity],
      );
    }
    return invoice.id;
  }

  const confirm = (id: number) => ({ p_purchase_invoice_id: id, p_branch_id: shop.branchId, p_user_id: shop.ownerId });

  it("adds stock for every line and marks the invoice confirmed", async () => {
    const product = await shop.seed.product();
    const invoice = await draftInvoice([{ product_id: product, raw: "Napa 500", quantity: 30 }]);

    await rpc(db, "confirm_purchase_invoice", confirm(invoice));

    expect(await one(db, "SELECT product_id, quantity FROM batch")).toEqual({ product_id: product, quantity: 30 });
    expect(await one(db, "SELECT status FROM purchase_invoice")).toEqual({ status: "confirmed" });
    expect(await rpcError(db, "confirm_purchase_invoice", confirm(invoice))).toMatch(/not a draft/);
  });

  it("refuses while lines are unmatched, naming them, with no stock effect", async () => {
    const product = await shop.seed.product();
    const invoice = await draftInvoice([
      { product_id: product, raw: "Napa 500", quantity: 30 },
      { product_id: null, raw: "Sergel 20", quantity: 5 },
      { product_id: null, raw: "Fexo 120", quantity: 5 },
    ]);

    expect(await rpcError(db, "confirm_purchase_invoice", confirm(invoice))).toMatch(
      /still need a matched product: Sergel 20, Fexo 120/,
    );
    expect(await all(db, "SELECT id FROM batch")).toEqual([]);
  });

  it("refuses an invoice with no lines", async () => {
    expect(await rpcError(db, "confirm_purchase_invoice", confirm(await draftInvoice([])))).toMatch(/no line items/);
  });
});
