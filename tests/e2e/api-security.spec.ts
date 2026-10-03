import { test, expect } from "./support/fixtures";
import { OWNER_STATE, STAFF_STATE } from "./support/seed";

// Checks the security boundaries over real HTTP against the running app — the layer browsers
// and attackers actually hit, including the proxy (middleware) in front of the route handlers.

test.describe("signed out", () => {
  test("API routes answer 401 JSON, not a login page", async ({ request }) => {
    for (const path of ["/api/products", "/api/customers", "/api/batches", "/api/credit-payments"]) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(401);
      expect(await res.json()).toEqual({ error: "Unauthorized" });
    }
  });

  test("public endpoints stay public", async ({ request }) => {
    expect((await request.get("/api/shop/products")).status()).toBe(200);
    expect((await request.get("/api/auth/users")).status()).toBe(200);
  });

  test("the login picker never exposes PIN hashes", async ({ request }) => {
    const { users } = await (await request.get("/api/auth/users")).json();
    expect(users.length).toBeGreaterThan(0);
    for (const user of users) expect(Object.keys(user).sort()).toEqual(["id", "name", "role"]);
  });
});

test.describe("owner session", () => {
  test.use({ storageState: OWNER_STATE });

  test("a cross-site POST is rejected even with a valid session cookie (CSRF)", async ({ request }) => {
    const res = await request.post("/api/sales", {
      headers: { Origin: "https://evil.example" },
      data: { items: [{ productId: 1, quantity: 1 }] },
    });
    expect(res.status()).toBe(403);
    expect(await res.json()).toEqual({ error: "Invalid origin" });
  });

  test("client-sent prices are ignored — the database prices the sale", async ({ request, data, baseURL }) => {
    const product = await data.product({ price: 50, stock: 5 });
    const res = await request.post("/api/sales", {
      headers: { Origin: baseURL! },
      data: { items: [{ productId: product.id, quantity: 1, price: 0.01, unitPrice: 0.01 }] },
    });
    expect(res.status()).toBe(200);
    expect(Number((await res.json()).sale.total_amount)).toBe(50);
  });
});

test.describe("staff session", () => {
  test.use({ storageState: STAFF_STATE });

  test("owner-only endpoints are forbidden", async ({ request, baseURL }) => {
    const headers = { Origin: baseURL! };
    const attempts = [
      request.post("/api/batches", { headers, data: { productId: 1, quantity: 5 } }),
      request.patch("/api/batches", { headers, data: { batchId: 1, quantityDelta: -1 } }),
      request.post("/api/credit-payments", { headers, data: { customerId: 1, amount: 1 } }),
      request.patch("/api/products", { headers, data: { id: 1, salePrice: 0.01 } }),
      request.post("/api/sales", { headers, data: { items: [{ productId: 1, quantity: 1 }], paymentMethod: "credit", customerId: 1 } }),
    ];
    for (const res of await Promise.all(attempts)) {
      expect(res.status(), res.url()).toBe(403);
    }
  });

  test("a staff session cannot place a wholesaler order", async ({ request, baseURL }) => {
    const res = await request.post("/api/wholesaler/orders", {
      headers: { Origin: baseURL! },
      data: { items: [{ productId: 1, quantity: 1 }] },
    });
    expect(res.status()).toBe(401);
  });
});
