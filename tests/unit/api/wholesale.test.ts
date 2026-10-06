import { beforeAll, describe, expect, it } from "vitest";
import { PATCH as updateOrder } from "@/app/api/wholesale-orders/[id]/route";
import { POST as login } from "@/app/api/wholesaler/login/route";
import { POST as placeOrder } from "@/app/api/wholesaler/orders/route";
import { POST as register } from "@/app/api/wholesaler/register/route";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { WHOLESALER_SESSION_COOKIE } from "@/lib/wholesaler/constants";
import { verifySessionToken } from "@/lib/wholesaler/session";
import { OWNER, STAFF, WHOLESALER, signInAs, signInAsWholesaler } from "../../helpers/auth";
import { getSetCookie } from "../../helpers/cookies";
import { params, patch, post, readJson } from "../../helpers/http";
import { mockSupabase, pgError } from "../../helpers/supabase-mock";

describe("POST /api/wholesaler/register", () => {
  const signUp = async (body: unknown) => readJson(await register(post("/api/wholesaler/register", body)));
  const valid = { shopName: " Rahim Pharma ", email: " Rahim@Example.COM ", password: "longenough", phone: "017" };

  it("creates the account with a hashed password, normalised email, and signs them in", async () => {
    const sb = mockSupabase();
    sb.onTable(
      "wholesaler",
      { data: null },
      { data: { id: 7, shop_name: "Rahim Pharma", phone: "017", email: "rahim@example.com", created_at: "now" } },
    );

    const res = await signUp(valid);

    expect(res.status).toBe(200);
    const insert = sb.tableCalls("wholesaler")[1].chain.find((c) => c.method === "insert");
    const row = insert?.args[0] as Record<string, string>;
    expect(row).toMatchObject({ shop_name: "Rahim Pharma", email: "rahim@example.com", phone: "017" });
    expect(row.password_hash).not.toBe("longenough");
    expect(await verifyPassword("longenough", row.password_hash)).toBe(true);
    expect(await verifySessionToken(getSetCookie(WHOLESALER_SESSION_COOKIE)!.value)).toEqual({
      id: 7,
      shopName: "Rahim Pharma",
      email: "rahim@example.com",
    });
  });

  it("409s when the email is taken", async () => {
    mockSupabase().onTable("wholesaler", { data: { id: 1 } });
    expect((await signUp(valid)).status).toBe(409);
  });

  it.each([
    [{ ...valid, shopName: "" }, /shopName/],
    [{ ...valid, email: "not-an-email" }, /email/],
    [{ ...valid, password: "short" }, /at least 8/],
  ])("rejects %j", async (body, message) => {
    const res = await signUp(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(message);
  });
});

describe("POST /api/wholesaler/login", () => {
  let hash: string;
  beforeAll(async () => {
    hash = await hashPassword("correct-horse");
  });
  const signIn = async (body: unknown) => readJson(await login(post("/api/wholesaler/login", body)));
  const account = (id: number) => ({ data: { id, shop_name: "Shop", email: "a@b.co", password_hash: hash } });

  it("signs in case-insensitively by email", async () => {
    const sb = mockSupabase();
    sb.onTable("wholesaler", account(30));

    expect((await signIn({ email: "A@B.CO", password: "correct-horse" })).status).toBe(200);
    expect(sb.tableCalls("wholesaler")[0].chain).toContainEqual({ method: "eq", args: ["email", "a@b.co"] });
  });

  it("locks out after 5 wrong passwords", async () => {
    const sb = mockSupabase();
    for (let i = 0; i < 7; i++) sb.onTable("wholesaler", account(31));
    for (let i = 0; i < 5; i++) await signIn({ email: "a@b.co", password: "wrong" });
    expect((await signIn({ email: "a@b.co", password: "correct-horse" })).status).toBe(429);
  });

  it("does not reveal whether the email exists", async () => {
    mockSupabase().onTable("wholesaler", { data: null });
    expect(await signIn({ email: "nobody@b.co", password: "x" })).toEqual({
      status: 401,
      body: { error: "Invalid credentials" },
    });
  });
});

describe("POST /api/wholesaler/orders", () => {
  const order = async (body: unknown) => readJson(await placeOrder(post("/api/wholesaler/orders", body)));

  it("requires a wholesaler session — a staff session is not enough", async () => {
    await signInAs(OWNER);
    expect((await order({ items: [{ productId: 1, quantity: 1 }] })).status).toBe(401);
  });

  it("always orders as the signed-in wholesaler and never forwards client prices", async () => {
    await signInAsWholesaler();
    const sb = mockSupabase();
    sb.onRpc("create_wholesaler_order", { data: { out_order_id: 2, out_total_amount: 70 } });

    const res = await order({ wholesalerId: 999, items: [{ productId: 5, quantity: 10, unitPrice: 0.01 }] });

    expect(res).toEqual({ status: 200, body: { ok: true, order: { id: 2, totalAmount: 70 } } });
    expect(sb.rpcCalls("create_wholesaler_order")).toEqual([
      { p_wholesaler_id: WHOLESALER.id, p_items: [{ product_id: 5, quantity: 10 }] },
    ]);
  });

  it.each([
    ["Insufficient stock: Napa (need 5, have 2)", 409],
    ["Napa is not available for wholesale ordering", 400],
    ["Wholesaler not found", 404],
  ])("maps '%s' to %i", async (message, status) => {
    await signInAsWholesaler();
    mockSupabase().onRpc("create_wholesaler_order", pgError(message));
    expect((await order({ items: [{ productId: 1, quantity: 5 }] })).status).toBe(status);
  });

  it.each([[{ items: [] }], [{ items: [{ productId: 1, quantity: 0 }] }], [{ items: [{ productId: -1, quantity: 1 }] }]])(
    "rejects %j",
    async (body) => {
      await signInAsWholesaler();
      expect((await order(body)).status).toBe(400);
    },
  );
});

describe("PATCH /api/wholesale-orders/[id]", () => {
  const act = async (id: string, body: unknown) =>
    readJson(await updateOrder(patch(`/api/wholesale-orders/${id}`, body), params({ id })));

  it("prepare calls the RPC with the session branch", async () => {
    await signInAs(STAFF);
    const sb = mockSupabase();
    sb.onRpc("prepare_wholesale_order", { data: { out_order_id: 3, out_sale_id: 9, out_status: "prepared" } });

    expect(await act("3", { action: "prepare" })).toEqual({ status: 200, body: { ok: true, status: "prepared", saleId: 9 } });
    expect(sb.rpcCalls("prepare_wholesale_order")).toEqual([
      { p_order_id: 3, p_branch_id: STAFF.branchId, p_user_id: STAFF.id },
    ]);
  });

  it("paying on credit is owner-only", async () => {
    await signInAs(STAFF);
    const sb = mockSupabase();
    expect((await act("3", { action: "pay", paymentMethod: "credit" })).status).toBe(403);
    expect(sb.rpcCalls("mark_wholesale_order_paid")).toEqual([]);
  });

  it("staff can take cash payment", async () => {
    await signInAs(STAFF);
    mockSupabase().onRpc("mark_wholesale_order_paid", { data: { out_order_id: 3, out_status: "paid" } });
    expect((await act("3", { action: "pay", paymentMethod: "cash" })).status).toBe(200);
  });

  it("cancel only succeeds for a pending order in the user's branch", async () => {
    await signInAs(STAFF);
    const sb = mockSupabase();
    sb.onTable("wholesale_order", { data: null });

    expect((await act("3", { action: "cancel" })).status).toBe(409);
    const chain = sb.tableCalls("wholesale_order")[0].chain;
    expect(chain).toContainEqual({ method: "eq", args: ["branch_id", STAFF.branchId] });
    expect(chain).toContainEqual({ method: "eq", args: ["status", "pending"] });
  });

  it.each([
    ["Order is not pending (current status: paid)", "prepare", 409],
    ["Insufficient stock for product 1 (need 5, have 0)", "prepare", 409],
    ["Wholesale order not found", "prepare", 404],
    ["Order must be prepared before it can be paid (current status: pending)", "pay", 409],
  ])("maps '%s' (%s) to %i", async (message, action, status) => {
    await signInAs(OWNER);
    const sb = mockSupabase();
    sb.onRpc("prepare_wholesale_order", pgError(message));
    sb.onRpc("mark_wholesale_order_paid", pgError(message));
    expect((await act("3", { action })).status).toBe(status);
  });

  it.each([
    ["abc", { action: "prepare" }],
    ["3", { action: "explode" }],
    ["3", { action: "pay", paymentMethod: "card" }],
  ])("rejects id=%s %j", async (id, body) => {
    await signInAs(OWNER);
    expect((await act(id, body)).status).toBe(400);
  });
});
