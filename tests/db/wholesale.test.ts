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

let db: TestDb;
let shop: Awaited<ReturnType<typeof seedShop>>;

beforeAll(async () => {
  db = await createTestDb();
});

beforeEach(async () => {
  await resetDb(db);
  shop = await seedShop(db);
});

// Staff-recorded bulk sales to a known customer: create (no stock) → prepare (stock out) → pay.
describe("wholesale_order lifecycle", () => {
  async function createOrder(items: unknown, customerId: number | null = null) {
    const [row] = await rpc<{ out_order_id: number; out_total_amount: string }>(db, "create_wholesale_order", {
      p_branch_id: shop.branchId,
      p_customer_id: customerId,
      p_user_id: shop.staffId,
      p_items: items,
    });
    return row;
  }
  const prepare = (orderId: number) => ({ p_order_id: orderId, p_branch_id: shop.branchId, p_user_id: shop.staffId });
  const payArgs = (orderId: number, method: string) => ({
    p_order_id: orderId,
    p_branch_id: shop.branchId,
    p_payment_method: method,
  });

  it("creating an order prices lines (with optional override) but does not touch stock", async () => {
    const product = await shop.seed.product({ sale_price: 10 });
    const batch = await shop.seed.batch(shop.branchId, product, 100);

    const order = await createOrder([
      { product_id: product, quantity: 5 },
      { product_id: product, quantity: 10, unit_price: 8 },
    ]);

    expect(Number(order.out_total_amount)).toBe(130);
    expect(await quantityOf(db, batch)).toBe(100);
  });

  it("preparing takes stock FEFO, creates a sale, and can only happen once", async () => {
    const product = await shop.seed.product({ sale_price: 10 });
    const early = await shop.seed.batch(shop.branchId, product, 4, { expiry_date: "2026-12-01" });
    const late = await shop.seed.batch(shop.branchId, product, 10, { expiry_date: "2027-12-01" });
    const order = await createOrder([{ product_id: product, quantity: 6 }]);

    const [prepared] = await rpc<{ out_sale_id: number; out_status: string }>(
      db,
      "prepare_wholesale_order",
      prepare(order.out_order_id),
    );

    expect(prepared.out_status).toBe("prepared");
    expect(await quantityOf(db, early)).toBe(0);
    expect(await quantityOf(db, late)).toBe(8);
    expect(Number((await one(db, "SELECT total_amount FROM sale WHERE id = $1", [prepared.out_sale_id])).total_amount)).toBe(60);
    expect(await rpcError(db, "prepare_wholesale_order", prepare(order.out_order_id))).toMatch(/not pending/);
  });

  it("preparing with any short line rolls back all stock changes", async () => {
    const ok = await shop.seed.product();
    const short = await shop.seed.product();
    const okBatch = await shop.seed.batch(shop.branchId, ok, 10);
    await shop.seed.batch(shop.branchId, short, 1);
    const order = await createOrder([
      { product_id: ok, quantity: 5 },
      { product_id: short, quantity: 5 },
    ]);

    expect(await rpcError(db, "prepare_wholesale_order", prepare(order.out_order_id))).toMatch(/Insufficient stock/);
    expect(await quantityOf(db, okBatch)).toBe(10);
    expect(await one(db, "SELECT status FROM wholesale_order")).toEqual({ status: "pending" });
  });

  it("paying on credit adds the order total to the customer's balance", async () => {
    const product = await shop.seed.product({ sale_price: 25 });
    await shop.seed.batch(shop.branchId, product, 10);
    const customer = await shop.seed.customer(shop.branchId, { credit_balance: 10 });
    const order = await createOrder([{ product_id: product, quantity: 4 }], customer);
    await rpc(db, "prepare_wholesale_order", prepare(order.out_order_id));

    await rpc(db, "mark_wholesale_order_paid", payArgs(order.out_order_id, "credit"));

    expect(await creditOf(db, customer)).toBe(110);
    expect(await one(db, "SELECT status, payment_method FROM wholesale_order")).toEqual({
      status: "paid",
      payment_method: "credit",
    });
  });

  it("refuses to pay an order that hasn't been prepared", async () => {
    const product = await shop.seed.product();
    const order = await createOrder([{ product_id: product, quantity: 1 }]);
    expect(await rpcError(db, "mark_wholesale_order_paid", payArgs(order.out_order_id, "cash"))).toMatch(
      /must be prepared before it can be paid/,
    );
  });

  it("refuses credit payment for an order with no customer", async () => {
    const product = await shop.seed.product();
    await shop.seed.batch(shop.branchId, product, 10);
    const order = await createOrder([{ product_id: product, quantity: 1 }]);
    await rpc(db, "prepare_wholesale_order", prepare(order.out_order_id));

    expect(await rpcError(db, "mark_wholesale_order_paid", payArgs(order.out_order_id, "credit"))).toMatch(
      /no customer attached/,
    );
  });
});

// Self-service orders placed by external wholesaler accounts, fulfilled by staff.
describe("wholesaler_order lifecycle", () => {
  async function placeOrder(wholesalerId: number, items: unknown) {
    const [row] = await rpc<{ out_order_id: number; out_total_amount: string }>(db, "create_wholesaler_order", {
      p_wholesaler_id: wholesalerId,
      p_items: items,
    });
    return row;
  }
  const fulfill = (orderId: number, items: unknown) => ({
    p_order_id: orderId,
    p_branch_id: shop.branchId,
    p_user_id: shop.staffId,
    p_items: items,
  });
  const orderItems = (orderId: number) =>
    all<{ id: number; product_id: number }>(
      db,
      "SELECT id, product_id FROM wholesaler_order_item WHERE wholesaler_order_id = $1 ORDER BY id",
      [orderId],
    );

  it("prices orders from wholesale_price, ignoring anything the client sends", async () => {
    const wholesaler = await shop.seed.wholesaler();
    const product = await shop.seed.product({ sale_price: 10, wholesale_price: 7 });
    await shop.seed.batch(shop.branchId, product, 100);

    const order = await placeOrder(wholesaler, [{ product_id: product, quantity: 10, unit_price: 0.01 }]);

    expect(Number(order.out_total_amount)).toBe(70);
  });

  it("refuses products with no wholesale price", async () => {
    const wholesaler = await shop.seed.wholesaler();
    const product = await shop.seed.product({ generic_name: "Retail Only", wholesale_price: null });
    await shop.seed.batch(shop.branchId, product, 100);

    expect(
      await rpcError(db, "create_wholesaler_order", { p_wholesaler_id: wholesaler, p_items: [{ product_id: product, quantity: 1 }] }),
    ).toMatch(/Retail Only is not available for wholesale ordering/);
  });

  it("lists every short item at once and creates nothing", async () => {
    const wholesaler = await shop.seed.wholesaler();
    const a = await shop.seed.product({ generic_name: "Alpha", wholesale_price: 1 });
    const b = await shop.seed.product({ generic_name: "Beta", wholesale_price: 1 });
    await shop.seed.batch(shop.branchId, a, 2);
    await shop.seed.batch(shop.branchId, b, 3);

    const message = await rpcError(db, "create_wholesaler_order", {
      p_wholesaler_id: wholesaler,
      p_items: [
        { product_id: a, quantity: 5 },
        { product_id: b, quantity: 9 },
      ],
    });

    expect(message).toMatch(/Alpha \(need 5, have 2\)/);
    expect(message).toMatch(/Beta \(need 9, have 3\)/);
    expect(await all(db, "SELECT id FROM wholesaler_order")).toEqual([]);
  });

  it("partial fulfilment takes only confirmed stock and marks the order partially_fulfilled", async () => {
    const wholesaler = await shop.seed.wholesaler();
    const a = await shop.seed.product({ wholesale_price: 5 });
    const b = await shop.seed.product({ wholesale_price: 3 });
    const batchA = await shop.seed.batch(shop.branchId, a, 100);
    const batchB = await shop.seed.batch(shop.branchId, b, 100);
    const order = await placeOrder(wholesaler, [
      { product_id: a, quantity: 10 },
      { product_id: b, quantity: 10 },
    ]);
    const [itemA] = await orderItems(order.out_order_id);

    const [result] = await rpc<{ out_status: string; out_sale_id: number }>(
      db,
      "fulfill_wholesaler_order",
      fulfill(order.out_order_id, [{ order_item_id: itemA.id, fulfill_quantity: 6 }]),
    );

    expect(result.out_status).toBe("partially_fulfilled");
    expect(await quantityOf(db, batchA)).toBe(94);
    expect(await quantityOf(db, batchB)).toBe(100);
    expect(Number((await one(db, "SELECT total_amount FROM sale WHERE id = $1", [result.out_sale_id])).total_amount)).toBe(30);
  });

  it("full fulfilment marks the order fulfilled and cannot be repeated", async () => {
    const wholesaler = await shop.seed.wholesaler();
    const a = await shop.seed.product({ wholesale_price: 5 });
    await shop.seed.batch(shop.branchId, a, 100);
    const order = await placeOrder(wholesaler, [{ product_id: a, quantity: 10 }]);
    const [item] = await orderItems(order.out_order_id);
    const items = [{ order_item_id: item.id, fulfill_quantity: 10 }];

    const [result] = await rpc<{ out_status: string }>(db, "fulfill_wholesaler_order", fulfill(order.out_order_id, items));

    expect(result.out_status).toBe("fulfilled");
    expect(await rpcError(db, "fulfill_wholesaler_order", fulfill(order.out_order_id, items))).toMatch(/not pending/);
  });

  it("refuses to fulfil more than was ordered", async () => {
    const wholesaler = await shop.seed.wholesaler();
    const a = await shop.seed.product({ wholesale_price: 5 });
    await shop.seed.batch(shop.branchId, a, 100);
    const order = await placeOrder(wholesaler, [{ product_id: a, quantity: 10 }]);
    const [item] = await orderItems(order.out_order_id);

    expect(
      await rpcError(db, "fulfill_wholesaler_order", fulfill(order.out_order_id, [{ order_item_id: item.id, fulfill_quantity: 11 }])),
    ).toMatch(/only 10 were ordered/);
  });

  it("refuses an all-zero fulfilment", async () => {
    const wholesaler = await shop.seed.wholesaler();
    const a = await shop.seed.product({ wholesale_price: 5 });
    await shop.seed.batch(shop.branchId, a, 100);
    const order = await placeOrder(wholesaler, [{ product_id: a, quantity: 10 }]);
    const [item] = await orderItems(order.out_order_id);

    expect(
      await rpcError(db, "fulfill_wholesaler_order", fulfill(order.out_order_id, [{ order_item_id: item.id, fulfill_quantity: 0 }])),
    ).toMatch(/greater than zero/);
  });

  it("refuses an item id that belongs to a different order", async () => {
    const wholesaler = await shop.seed.wholesaler();
    const a = await shop.seed.product({ wholesale_price: 5 });
    await shop.seed.batch(shop.branchId, a, 100);
    const first = await placeOrder(wholesaler, [{ product_id: a, quantity: 1 }]);
    const second = await placeOrder(wholesaler, [{ product_id: a, quantity: 1 }]);
    const [foreignItem] = await orderItems(second.out_order_id);

    expect(
      await rpcError(db, "fulfill_wholesaler_order", fulfill(first.out_order_id, [{ order_item_id: foreignItem.id, fulfill_quantity: 1 }])),
    ).toMatch(/not found on this order/);
  });
});
