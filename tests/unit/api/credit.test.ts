import { describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/credit-payments/route";
import { POST as addCustomer } from "@/app/api/customers/route";
import { OWNER, STAFF, signInAs } from "../../helpers/auth";
import { get, post, readJson } from "../../helpers/http";
import { mockSupabase, pgError } from "../../helpers/supabase-mock";

describe("POST /api/credit-payments", () => {
  const pay = async (body: unknown) => readJson(await POST(post("/api/credit-payments", body)));

  it("is owner-only", async () => {
    await signInAs(STAFF);
    expect((await pay({ customerId: 1, amount: 10 })).status).toBe(403);
  });

  it("records the payment against the session user and returns the new balance", async () => {
    await signInAs(OWNER);
    const sb = mockSupabase();
    sb.onRpc("record_credit_payment", { data: { out_customer_id: 3, out_credit_balance: 40 } });

    expect(await pay({ customerId: "3", amount: "60" })).toEqual({
      status: 200,
      body: { ok: true, customerId: 3, creditBalance: 40 },
    });
    expect(sb.rpcCalls("record_credit_payment")).toEqual([{ p_customer_id: 3, p_amount: 60, p_user_id: OWNER.id }]);
  });

  it.each([
    [{ amount: 10 }, /customerId/],
    [{ customerId: 1, amount: 0 }, /positive/],
    [{ customerId: 1, amount: "ten" }, /positive/],
  ])("rejects %j", async (body, message) => {
    await signInAs(OWNER);
    const res = await pay(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(message);
  });

  it.each([
    ["Customer not found", 404],
    ["Payment (90) exceeds outstanding credit balance (40)", 400],
    ["deadlock detected", 500],
  ])("maps '%s' to %i", async (message, status) => {
    await signInAs(OWNER);
    mockSupabase().onRpc("record_credit_payment", pgError(message));
    expect((await pay({ customerId: 1, amount: 90 })).status).toBe(status);
  });
});

describe("GET /api/credit-payments", () => {
  it("filters by customer when asked", async () => {
    await signInAs(STAFF);
    const sb = mockSupabase();
    sb.onTable("credit_payment", { data: [] });

    expect((await GET(get("/api/credit-payments?customerId=4"))).status).toBe(200);
    expect(sb.tableCalls("credit_payment")[0].chain).toContainEqual({ method: "eq", args: ["customer_id", 4] });
  });

  it("rejects a malformed customerId", async () => {
    await signInAs(STAFF);
    expect((await GET(get("/api/credit-payments?customerId=x"))).status).toBe(400);
  });
});

describe("POST /api/customers", () => {
  it("creates the customer in the session's branch", async () => {
    await signInAs(STAFF);
    const sb = mockSupabase();
    sb.onTable("customer", { data: { id: 1, name: "Karim" } });

    const res = await readJson(await addCustomer(post("/api/customers", { name: " Karim ", phone: "", branch_id: 99 })));

    expect(res.status).toBe(200);
    const insert = sb.tableCalls("customer")[0].chain.find((c) => c.method === "insert");
    expect(insert?.args[0]).toEqual({ branch_id: STAFF.branchId, name: "Karim", phone: null, address: null });
  });

  it("requires a name", async () => {
    await signInAs(STAFF);
    expect((await addCustomer(post("/api/customers", { name: "  " }))).status).toBe(400);
  });
});
