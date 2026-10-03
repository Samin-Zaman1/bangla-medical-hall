import { test, expect } from "./support/fixtures";
import { uniq } from "./support/db";

test("the public shop lists products with stock and retail price — no login needed", async ({ page, data }) => {
  const inStock = await data.product({ name: uniq("Napa Extra"), price: 3, wholesalePrice: 2.1, stock: 12 });
  const soldOut = await data.product({ name: uniq("Fexo"), price: 8, stock: 0 });

  await page.goto("/shop");
  const searchBox = page.getByRole("textbox", { name: "Search products" });

  await searchBox.fill(inStock.name);
  // The product card: the innermost element holding both the name and the stock badge.
  const card = page
    .locator("div")
    .filter({ has: page.getByRole("heading", { name: inStock.name }) })
    .filter({ hasText: "in stock" })
    .last();
  await expect(card).toContainText("৳3.00");
  await expect(card).toContainText("12 in stock");
  // Wholesale prices must never leak to the public storefront.
  await expect(card).not.toContainText("2.10");

  await searchBox.fill(soldOut.name);
  await expect(page.getByRole("heading", { name: soldOut.name })).toBeVisible();
  await expect(page.getByText("Out of stock").first()).toBeVisible();
});
