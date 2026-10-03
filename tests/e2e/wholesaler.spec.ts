import { test, expect, gotoHydrated } from "./support/fixtures";
import { uniq } from "./support/db";
import { OWNER_STATE, STAFF_STATE } from "./support/seed";

test("a wholesaler signs up, orders stock, and staff partially fulfil it", async ({ browser, data }) => {
  const product = await data.product({ name: uniq("Amoxicillin"), price: 12, wholesalePrice: 9, stock: 30 });
  const shopName = uniq("Rahman Pharmacy");
  const email = `${shopName.replace(/\s+/g, ".").toLowerCase()}@example.com`;

  // --- Wholesaler, in their own browser context -------------------------------------------
  const wholesalerContext = await browser.newContext();
  const wholesaler = await wholesalerContext.newPage();
  await gotoHydrated(wholesaler, "/wholesaler/register");
  await wholesaler.getByLabel("Shop name").fill(shopName);
  await wholesaler.getByLabel("Email").fill(email);
  await wholesaler.getByLabel("Password", { exact: true }).fill("strong-password-1");
  await wholesaler.getByLabel("Confirm password").fill("strong-password-1");
  await wholesaler.getByRole("button", { name: "Create account" }).click();

  await expect(wholesaler).toHaveURL(/\/wholesaler\/catalog$/);
  await wholesaler.getByRole("textbox", { name: "Search products" }).fill(product.name);
  await wholesaler.getByRole("spinbutton", { name: `Quantity of ${product.name}` }).fill("10");
  await expect(wholesaler.getByText("৳90.00").first()).toBeVisible();
  await wholesaler.getByRole("button", { name: "Place order" }).click();
  await expect(wholesaler.getByText(/Order #\d+ placed — total ৳90\.00/)).toBeVisible();
  // Placing an order reserves nothing — stock only moves when staff fulfil it.
  expect(await data.stockOf(product.id)).toBe(30);
  await wholesalerContext.close();

  // --- Staff fulfil 6 of the 10 ----------------------------------------------------------------
  const staffContext = await browser.newContext({ storageState: STAFF_STATE });
  const staff = await staffContext.newPage();
  await gotoHydrated(staff, "/wholesaler-orders");
  const order = staff.locator("div.rounded-lg").filter({ hasText: shopName });
  await expect(order).toContainText(/pending/i);
  await order.getByRole("spinbutton", { name: `Quantity to release of ${product.name}` }).fill("6");
  await order.getByRole("button", { name: "Confirm fulfillment" }).click();

  await expect(order).toContainText("Partially fulfilled");
  await expect(order).toContainText("fulfilled 6");
  expect(await data.stockOf(product.id)).toBe(24);
  await staffContext.close();
});

test("an existing wholesaler can sign back in; a wrong password is refused", async ({ page, request }) => {
  const email = `${uniq("returning").replace(/\s+/g, ".")}@example.com`;
  await request.post("/api/wholesaler/register", {
    data: { shopName: "Returning Shop", email, password: "correct-horse-1" },
  });

  await gotoHydrated(page, "/wholesaler/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Invalid credentials")).toBeVisible();

  await page.getByLabel("Password", { exact: true }).fill("correct-horse-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/wholesaler\/catalog$/);
});

test.describe("staff", () => {
  test.use({ storageState: OWNER_STATE });

  test("can browse the wholesale catalog but not order from it", async ({ page, data }) => {
    const product = await data.product({ wholesalePrice: 4, stock: 10 });
    await gotoHydrated(page, "/wholesaler/catalog");
    await page.getByRole("textbox", { name: "Search products" }).fill(product.name);
    await expect(page.getByRole("heading", { name: product.name })).toBeVisible();
    await expect(page.getByRole("spinbutton", { name: `Quantity of ${product.name}` })).toHaveCount(0);
  });
});

test("the catalog requires an account", async ({ page }) => {
  await gotoHydrated(page, "/wholesaler/catalog");
  await expect(page).toHaveURL(/\/wholesaler\/login$/);
});
