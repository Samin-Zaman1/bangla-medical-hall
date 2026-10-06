import { test, expect } from "@playwright/test";

// Read-only checks that are safe to run against production after every deploy
// (E2E_BASE_URL=https://… npx playwright test --project=smoke). They never sign in or write.

test.describe("@smoke", () => {
  test("login page renders and can reach the database", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    // The user picker is filled from the database: an error here means the deploy can't reach Supabase.
    await expect(page.getByText("Could not connect to the server")).toHaveCount(0);
  });

  test("public shop renders", async ({ page }) => {
    const response = await page.goto("/shop");
    expect(response?.status()).toBeLessThan(400);
    await expect(page.getByRole("textbox", { name: "Search products" })).toBeVisible();
  });

  test("protected pages redirect to login", async ({ page }) => {
    await page.goto("/inventory");
    await expect(page).toHaveURL(/\/login\?from=%2Finventory$/);
  });

  test("protected APIs refuse anonymous requests", async ({ request }) => {
    expect((await request.get("/api/products")).status()).toBe(401);
    expect((await request.get("/api/auth")).status()).toBe(401);
  });

  test("setup endpoint is locked in production", async ({ request, baseURL }) => {
    test.skip(/localhost|127\.0\.0\.1/.test(baseURL ?? ""), "only meaningful against a deployed build");
    const res = await request.post("/api/setup/seed", { data: { pin: "1234" } });
    expect(res.status()).toBe(403);
  });
});
