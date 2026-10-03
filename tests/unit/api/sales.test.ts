import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/sales/route";
import { OWNER, STAFF, signInAs } from "../../helpers/auth";
import { post, readJson } from "../../helpers/http";
import { mockSupabase, pgError } from "../../helpers/supabase-mock";

const SALE_ROW = { sale_id: 41, subtotal: 30, total_amount: 25, receipt_number: "RCPT-1-1" };

const sell = async (body: unknown) => readJson(await POST(post("/api/sales", body)));

const validBill = { items: [{ productId: 3, quantity: 2 }] };

describe("POST /api/sales", () => {
  describe("auth", () => {
    it("401s without a session", async () => {
      expect((await sell(validBill)).status).toBe(401);
    });

    it("lets staff ring up a cash sale", async () => {
      await signInAs(STAFF);
      mockSupabase().onRpc("create_sale", { data: SALE_ROW });
      expect((await sell(validBill)).status).toBe(200);
    });

    it("forbids staff from selling on credit", async () => {
      await signInAs(STAFF);
      const sb = mockSupabase();
      const res = await sell({ ...validBill, paymentMethod: "credit", customerId: 5 });
      expect(res.status).toBe(403);
      expect(sb.rpcCalls("create_sale")).toEqual([]);
    });

    it("lets the owner sell on credit", async () => {
      await signInAs(OWNER);
      mockSupabase().onRpc("create_sale", { data: SALE_ROW });
      expect((await sell({ ...validBill, paymentMethod: "credit", customerId: 5 })).status).toBe(200);
    });
  });

  it("sends the bill to create_sale with branch/user from the session, never from the body", async () => {
    await signInAs(STAFF);
    const sb = mockSupabase();
    sb.onRpc("create_sale", { data: SALE_ROW });

    const res = await sell({
      items: [
        { productId: 3, quantity: 2 },
        { productId: "9", quantity: "1", unitPrice: 0.01 },
      ],
      customerId: "12",
      paymentMethod: "bkash",
      discountAmount: "5.555",
      branchId: 999,
      userId: 999,
    });

    expect(res).toEqual({
      status: 200,
      body: { ok: true, sale: { id: 41, subtotal: 30, total_amount: 25, receipt_number: "RCPT-1-1" } },
    });
    expect(sb.rpcCalls("create_sale")).toEqual([
      {
        p_branch_id: STAFF.branchId,
        p_user_id: STAFF.id,
        p_items: [
          { product_id: 3, quantity: 2 },
          { product_id: 9, quantity: 1 },
        ],
        p_customer_id: 12,
        p_payment_method: "bkash",
        p_discount_amount: 5.56,
      },
    ]);
  });

  it("defaults to a cash walk-in sale with no discount", async () => {
    await signInAs(STAFF);
    const sb = mockSupabase();
    sb.onRpc("create_sale", { data: SALE_ROW });

    await sell(validBill);

    expect(sb.rpcCalls("create_sale")[0]).toMatchObject({
      p_customer_id: null,
      p_payment_method: "cash",
      p_discount_amount: 0,
    });
  });

  describe("validation (rejected before touching the database)", () => {
    it.each([
      ["malformed JSON", "{not json", /Invalid JSON/],
      ["no items", {}, /at least one product/],
      ["an empty bill", { items: [] }, /at least one product/],
      ["items that aren't an array", { items: "3x2" }, /at least one product/],
      ["more than 100 lines", { items: Array.from({ length: 101 }, (_, i) => ({ productId: i + 1, quantity: 1 })) }, /at most 100/],
      ["a bad productId", { items: [{ productId: "abc", quantity: 1 }] }, /valid productId/],
      ["a zero productId", { items: [{ productId: 0, quantity: 1 }] }, /valid productId/],
      ["a fractional quantity", { items: [{ productId: 1, quantity: 1.5 }] }, /positive integer/],
      ["a zero quantity", { items: [{ productId: 1, quantity: 0 }] }, /positive integer/],
      ["a null line", { items: [null] }, /valid productId/],
      ["an unknown payment method", { ...validBill, paymentMethod: "card" }, /paymentMethod/i],
      ["a bad customerId", { ...validBill, customerId: "abc" }, /customerId/],
      ["a negative discount", { ...validBill, discountAmount: -1 }, /Discount/],
      ["a non-numeric discount", { ...validBill, discountAmount: "lots" }, /Discount/],
    ])("rejects %s", async (_label, body, message) => {
      await signInAs(OWNER);
      const sb = mockSupabase();
      const res = await sell(body);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(message);
      expect(sb.rpcCalls("create_sale")).toEqual([]);
    });

    it("treats an empty-string discount as no discount", async () => {
      await signInAs(STAFF);
      const sb = mockSupabase();
      sb.onRpc("create_sale", { data: SALE_ROW });
      await sell({ ...validBill, discountAmount: "" });
      expect(sb.rpcCalls("create_sale")[0]).toMatchObject({ p_discount_amount: 0 });
    });
  });

  describe("maps database errors to HTTP statuses", () => {
    it.each([
      ["Product not found (id 4)", 404],
      ["Customer not found", 404],
      ["Insufficient stock for Napa (need 5, have 2)", 409],
      ["Quantity must be a positive integer", 400],
      ["Invalid payment method", 400],
      ["A customer is required for a credit sale", 400],
      ["Discount cannot exceed the subtotal", 400],
      ["Discount cannot be negative", 400],
      ["A sale needs at least one item", 400],
      ["connection reset by peer", 500],
    ])("%s → %i", async (message, status) => {
      await signInAs(OWNER);
      mockSupabase().onRpc("create_sale", pgError(message));
      const res = await sell(validBill);
      expect(res).toEqual({ status, body: { error: message } });
    });
  });
});
