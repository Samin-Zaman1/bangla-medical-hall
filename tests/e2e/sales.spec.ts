import { test, expect, gotoHydrated, appAlert, type Page } from "./support/fixtures";
import { OWNER_STATE, STAFF_STATE } from "./support/seed";

const bill = (page: Page) => page.locator("section").filter({ has: page.getByRole("heading", { name: "Current bill" }) });
const search = (page: Page) => page.getByRole("textbox", { name: "Search products" });

async function addToBill(page: Page, productName: string) {
  await search(page).fill(productName);
  await page.getByRole("button", { name: new RegExp(`^${productName}`) }).click({ timeout: 5_000 });
}

test.describe("cashier (staff)", () => {
  test.use({ storageState: STAFF_STATE });

  test("rings up a multi-item cash sale with a discount and change @mobile", async ({ page, data }, testInfo) => {
    // KNOWN BUG: the dashboard sidebar is a fixed 256px column with no phone layout, so on a
    // narrow screen the page scrolls sideways and the sidebar intercepts taps on products.
    // Remove this once the layout is responsive — the test will then report an unexpected pass.
    test.fail(testInfo.project.name === "mobile", "Dashboard layout is not responsive on phones");
    const napa = await data.product({ price: 2.5, stock: 40 });
    const seclo = await data.product({ price: 7, stock: 10 });

    await gotoHydrated(page, "/sales");
    await addToBill(page, napa.name);
    await addToBill(page, seclo.name);
    await bill(page).getByRole("spinbutton", { name: `Quantity of ${napa.name}` }).fill("4");
    await bill(page)
      .getByRole("listitem")
      .filter({ hasText: seclo.name })
      .getByRole("button", { name: "Increase quantity" })
      .click();

    await expect(bill(page).getByText("6 items")).toBeVisible();
    await page.getByLabel("Discount (৳)").fill("2");
    await page.getByLabel("Cash received (৳)").fill("50");
    // 4 × 2.50 + 2 × 7.00 = 24.00, minus 2.00 discount
    await expect(page.getByRole("button", { name: /Complete sale · ৳22\.00/ })).toBeEnabled();
    await expect(page.getByText("Change to return")).toBeVisible();

    await page.getByRole("button", { name: /Complete sale/ }).click();

    await expect(page.getByRole("heading", { name: "Sale complete" })).toBeVisible();
    await expect(page.getByText("Return change: ৳28.00")).toBeVisible();
    await expect.poll(() => data.stockOf(napa.id)).toBe(36);
    await expect.poll(() => data.stockOf(seclo.id)).toBe(8);

    await page.getByRole("link", { name: /View \/ print receipt/ }).click();
    await expect(page).toHaveURL(/\/sales\/history\/\d+$/);
    const receipt = page.getByRole("table");
    await expect(receipt.getByRole("row", { name: new RegExp(napa.name) })).toContainText("4");
    await expect(receipt.getByRole("row", { name: new RegExp(seclo.name) })).toContainText("2");
  });

  test("cannot sell on credit", async ({ page, data }) => {
    const product = await data.product({ stock: 5 });
    await gotoHydrated(page, "/sales");
    await addToBill(page, product.name);
    await expect(page.getByRole("button", { name: "Cash", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Credit (baki)" })).toHaveCount(0);
  });

  test("keeps the bill and explains when stock ran out after the page loaded", async ({ page, data }) => {
    const product = await data.product({ stock: 3 });
    await gotoHydrated(page, "/sales");
    await addToBill(page, product.name);
    await bill(page).getByRole("spinbutton", { name: `Quantity of ${product.name}` }).fill("3");

    // Another till sells the last units in the meantime.
    await data.setStock(product.id, 1);
    await page.getByRole("button", { name: /Complete sale/ }).click();

    await expect(appAlert(page)).toContainText(`Insufficient stock for ${product.name} (need 3, have 1)`);
    await expect(bill(page).getByText(product.name, { exact: true })).toBeVisible();
    expect(await data.stockOf(product.id)).toBe(1);
  });

  test("out-of-stock products are shown but can't be added", async ({ page, data }) => {
    const product = await data.product({ stock: 0 });
    await gotoHydrated(page, "/sales");
    await search(page).fill(product.name);
    const button = page.getByRole("button", { name: new RegExp(`^${product.name}`) });
    await expect(button).toBeDisabled();
    await expect(button).toContainText("Out of stock");
  });
});

test.describe("owner", () => {
  test.use({ storageState: OWNER_STATE });

  test("puts a sale on a customer's credit (baki) account", async ({ page, data }) => {
    const product = await data.product({ price: 15, stock: 10 });
    const customer = await data.customer({ credit: 100 });

    await gotoHydrated(page, "/sales");
    await addToBill(page, product.name);
    await bill(page).getByRole("spinbutton", { name: `Quantity of ${product.name}` }).fill("2");
    await page.getByRole("button", { name: "Credit (baki)" }).click();

    const complete = page.getByRole("button", { name: /Complete sale/ });
    await expect(page.getByText("Choose a customer to put this sale on credit.")).toBeVisible();
    await expect(complete).toBeDisabled();

    await page.getByLabel("Customer").selectOption({ label: `${customer.name} — owes ৳100.00` });
    await complete.click();

    await expect(page.getByRole("heading", { name: "Sale complete" })).toBeVisible();
    await expect.poll(() => data.creditOf(customer.id)).toBe(130);
  });

  test("today's sales list shows the new sale", async ({ page, data }) => {
    const product = await data.product({ price: 9.5, stock: 5 });
    await gotoHydrated(page, "/sales");
    await addToBill(page, product.name);
    await page.getByRole("button", { name: /Complete sale/ }).click();
    const done = page.locator("section").filter({ has: page.getByRole("heading", { name: "Sale complete" }) });
    const receiptNumber = await done.getByText(/^RCPT-\d+-\d+$/).textContent();

    await page.getByRole("button", { name: "New sale" }).click();
    await page.reload();
    await expect(page.getByText(receiptNumber!)).toBeVisible();

    await gotoHydrated(page, "/sales/history");
    await expect(page.getByText(receiptNumber!)).toBeVisible();
  });
});
