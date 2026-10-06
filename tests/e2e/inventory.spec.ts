import { test, expect, gotoHydrated, openSection, type Page } from "./support/fixtures";
import { uniq } from "./support/db";
import { OWNER_STATE } from "./support/seed";

const rowFor = (page: Page, text: string) => page.getByRole("row").filter({ hasText: text });

test.use({ storageState: OWNER_STATE });

test("adds a product, receives stock for it and adjusts the count", async ({ page, data, sql }) => {
  const name = uniq("Cetirizine");

  await gotoHydrated(page, "/products");
  await openSection(page, "Add product");
  await page.getByLabel("Generic name").fill(name);
  await page.getByLabel("Brand name").fill("Alatrol");
  await page.getByLabel("Strength").fill("10mg");
  await page.getByLabel("Sale price", { exact: true }).fill("3.5");
  await page.getByLabel("Wholesale price").fill("2.8");
  await page.locator("form").getByRole("button", { name: "Add product" }).click();

  await expect(page.getByText(`Added: ${name}`)).toBeVisible();
  await expect(rowFor(page, name)).toContainText("Alatrol");

  await gotoHydrated(page, "/inventory");
  await openSection(page, "Add stock batch");
  await page.getByLabel("Product").selectOption({ label: name });
  await page.getByLabel("Quantity").fill("60");
  await page.getByLabel("Batch number").fill("LOT-77");
  await page.getByLabel("Expiry date").fill("2027-08-31");
  await page.getByRole("button", { name: "Add batch" }).click();

  await expect(page.getByText("Batch added: 60 unit(s).")).toBeVisible();
  const batchRow = rowFor(page, "LOT-77").filter({ hasText: name });
  await expect(batchRow).toContainText("60");

  await batchRow.getByPlaceholder("±qty").fill("-5");
  await batchRow.getByPlaceholder("reason").fill("damaged strip");
  await batchRow.getByRole("button", { name: "Adjust" }).click();
  await expect(batchRow.getByRole("cell").nth(4)).toHaveText("55");

  const [product] = await sql<{ id: number }[]>`SELECT id FROM product WHERE generic_name = ${name}`;
  expect(await data.stockOf(product.id)).toBe(55);
  const [movement] = await sql<{ reason: string; quantity: number }[]>`
    SELECT sm.reason, sm.quantity FROM stock_movement sm JOIN batch b ON b.id = sm.batch_id
    WHERE b.product_id = ${product.id} AND sm.type = 'adjustment'`;
  expect(movement).toEqual({ reason: "damaged strip", quantity: -5 });
});

test("refuses an adjustment that would make stock negative", async ({ page, data }) => {
  const product = await data.product({ stock: 4 });
  await gotoHydrated(page, "/inventory");
  const row = rowFor(page, product.name);

  await row.getByPlaceholder("±qty").fill("-10");
  await row.getByRole("button", { name: "Adjust" }).click();

  await expect(row.getByText("Adjustment would result in negative stock")).toBeVisible();
  expect(await data.stockOf(product.id)).toBe(4);
});

test("flags low stock on the products page", async ({ page, data }) => {
  const low = await data.product({ stock: 3 });
  await gotoHydrated(page, "/products");
  await expect(rowFor(page, low.name)).toContainText(/low/i);
});
