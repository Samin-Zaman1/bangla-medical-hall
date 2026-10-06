import { describe, expect, it } from "vitest";
import { PATCH as adjustBatch, POST as createBatch } from "@/app/api/batches/route";
import { GET as listProducts, PATCH as editProduct, POST as addProduct } from "@/app/api/products/route";
import { OWNER, STAFF, signInAs } from "../../helpers/auth";
import { patch, post, readJson } from "../../helpers/http";
import { mockSupabase, pgError } from "../../helpers/supabase-mock";

describe("POST /api/batches", () => {
  const create = async (body: unknown) => readJson(await createBatch(post("/api/batches", body)));

  it("is owner-only (stock_adjustment)", async () => {
    await signInAs(STAFF);
    expect((await create({ productId: 1, quantity: 5 })).status).toBe(403);
  });

  it("passes the batch to create_batch with nulls for blank optional fields", async () => {
    await signInAs(OWNER);
    const sb = mockSupabase();
    sb.onRpc("create_batch", { data: { batch_id: 8, quantity: 50 } });

    const res = await create({ productId: "4", quantity: 50, batchNumber: "  LOT-1 ", costPrice: "", supplierId: "" });

    expect(res).toEqual({ status: 200, body: { ok: true, batch: { id: 8, quantity: 50 } } });
    expect(sb.rpcCalls("create_batch")).toEqual([
      {
        p_branch_id: OWNER.branchId,
        p_product_id: 4,
        p_quantity: 50,
        p_batch_number: "LOT-1",
        p_expiry_date: null,
        p_cost_price: null,
        p_supplier_id: null,
        p_user_id: OWNER.id,
      },
    ]);
  });

  it.each([
    [{ productId: 0, quantity: 5 }, /productId/],
    [{ productId: 1, quantity: 0 }, /positive integer/],
    [{ productId: 1, quantity: 2.5 }, /positive integer/],
  ])("rejects %j", async (body, message) => {
    await signInAs(OWNER);
    const res = await create(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(message);
  });

  it("404s for an unknown product", async () => {
    await signInAs(OWNER);
    mockSupabase().onRpc("create_batch", pgError("Product not found"));
    expect((await create({ productId: 9, quantity: 1 })).status).toBe(404);
  });
});

describe("PATCH /api/batches", () => {
  const adjust = async (body: unknown) => readJson(await adjustBatch(patch("/api/batches", body)));

  it("is owner-only", async () => {
    await signInAs(STAFF);
    expect((await adjust({ batchId: 1, quantityDelta: -1 })).status).toBe(403);
  });

  it("rejects a zero delta before calling the database", async () => {
    await signInAs(OWNER);
    const sb = mockSupabase();
    expect((await adjust({ batchId: 1, quantityDelta: 0 })).status).toBe(400);
    expect(sb.rpcCalls("adjust_batch_quantity")).toEqual([]);
  });

  it.each([
    ["Batch not found", 404],
    ["Adjustment would result in negative stock", 409],
  ])("maps '%s' to %i", async (message, status) => {
    await signInAs(OWNER);
    mockSupabase().onRpc("adjust_batch_quantity", pgError(message));
    expect((await adjust({ batchId: 1, quantityDelta: -100 })).status).toBe(status);
  });
});

describe("GET /api/products", () => {
  it("adds per-branch stock totals and a low_stock flag at or below the reorder threshold", async () => {
    await signInAs(STAFF);
    const sb = mockSupabase();
    sb.onTable("product", {
      data: [
        { id: 1, generic_name: "A", reorder_threshold: 10 },
        { id: 2, generic_name: "B", reorder_threshold: 10 },
        { id: 3, generic_name: "C", reorder_threshold: 0 },
      ],
    });
    sb.onTable("batch", {
      data: [
        { product_id: 1, quantity: 6 },
        { product_id: 1, quantity: 4 },
        { product_id: 2, quantity: 11 },
        { product_id: null, quantity: 99 },
      ],
    });

    const { body } = await readJson(await listProducts());

    expect(body.products.map((p: Record<string, unknown>) => [p.id, p.total_quantity, p.low_stock])).toEqual([
      [1, 10, true],
      [2, 11, false],
      [3, 0, true],
    ]);
    const batchQuery = sb.tableCalls("batch")[0].chain;
    expect(batchQuery).toContainEqual({ method: "eq", args: ["branch_id", STAFF.branchId] });
  });

  it("401s when signed out", async () => {
    expect((await listProducts()).status).toBe(401);
  });
});

describe("POST /api/products", () => {
  const add = async (body: unknown) => readJson(await addProduct(post("/api/products", body)));

  it("lets staff add a product with trimmed fields and defaults", async () => {
    await signInAs(STAFF);
    const sb = mockSupabase();
    sb.onTable("product", { data: { id: 5 } });

    expect((await add({ genericName: "  Napa ", salePrice: "1.5", brandName: "" })).status).toBe(200);

    const insert = sb.tableCalls("product")[0].chain.find((c) => c.method === "insert");
    expect(insert?.args[0]).toMatchObject({
      generic_name: "Napa",
      brand_name: null,
      sale_price: 1.5,
      wholesale_price: null,
      reorder_threshold: 10,
      is_controlled: false,
    });
  });

  it.each([
    [{ salePrice: 1 }, /genericName/],
    [{ genericName: "X", salePrice: -1 }, /salePrice/],
    [{ genericName: "X", salePrice: 1, reorderThreshold: 2.5 }, /reorderThreshold/],
    [{ genericName: "X", salePrice: 1, wholesalePrice: "free" }, /wholesalePrice/],
  ])("rejects %j", async (body, message) => {
    await signInAs(OWNER);
    const res = await add(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(message);
  });
});

describe("PATCH /api/products", () => {
  const edit = async (body: unknown) => readJson(await editProduct(patch("/api/products", body)));

  it("staff can rename a product", async () => {
    await signInAs(STAFF);
    mockSupabase().onTable("product", { data: { id: 1, generic_name: "New" } });
    expect((await edit({ id: 1, genericName: "New" })).status).toBe(200);
  });

  it.each([["salePrice", 9], ["wholesalePrice", 7]])("staff cannot change %s", async (field, value) => {
    await signInAs(STAFF);
    const sb = mockSupabase();
    expect((await edit({ id: 1, [field]: value })).status).toBe(403);
    expect(sb.tableCalls("product")).toEqual([]);
  });

  it("owner can change prices, and clearing the wholesale price stores null", async () => {
    await signInAs(OWNER);
    const sb = mockSupabase();
    sb.onTable("product", { data: { id: 1 } });

    await edit({ id: 1, salePrice: "12.5", wholesalePrice: "" });

    const update = sb.tableCalls("product")[0].chain.find((c) => c.method === "update");
    expect(update?.args[0]).toEqual({ sale_price: 12.5, wholesale_price: null });
  });

  it("404s when the product doesn't exist", async () => {
    await signInAs(OWNER);
    mockSupabase().onTable("product", { data: null });
    expect((await edit({ id: 99, genericName: "X" })).status).toBe(404);
  });

  it.each([
    [{ genericName: "X" }, /product id/],
    [{ id: 1 }, /No fields/],
    [{ id: 1, genericName: "  " }, /cannot be empty/],
  ])("rejects %j", async (body, message) => {
    await signInAs(OWNER);
    const res = await edit(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(message);
  });
});
