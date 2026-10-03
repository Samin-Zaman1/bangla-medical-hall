import { test, expect } from "./support/fixtures";
import { OWNER_STATE, STAFF_STATE } from "./support/seed";

const NAV = [
  { label: "Make a Sale", heading: "Make a Sale" },
  { label: "Inventory", heading: "Inventory" },
  { label: "Products", heading: "Products" },
  { label: "Stock In", heading: /Stock In|Purchases/ },
  { label: "Purchase Invoices", heading: /Purchase Invoices/ },
  { label: "Wholesale", heading: /Wholesale/ },
  { label: "Wholesaler Orders", heading: "Wholesaler Orders" },
  { label: "Customers", heading: "Customers" },
  { label: "Requests", heading: /Requests/ },
  { label: "Reports", heading: "Reports" },
];

test.describe("owner", () => {
  test.use({ storageState: OWNER_STATE });

  // Walks the whole sidebar: every page must render its heading without a server or client
  // error (uncaught page errors fail the test via the pageErrors fixture).
  test("every page in the sidebar loads", async ({ page }) => {
    await page.goto("/sales");
    const sidebar = page.getByRole("navigation");
    for (const item of NAV) {
      await sidebar.getByRole("link", { name: item.label, exact: true }).click();
      await expect(page.getByRole("heading", { level: 1, name: item.heading }).first()).toBeVisible();
    }
  });

  test("sees owner-only controls", async ({ page, data }) => {
    await data.product({ stock: 5 });
    await page.goto("/inventory");
    await expect(page.getByRole("columnheader", { name: "Adjust" })).toBeVisible();
  });
});

test.describe("staff", () => {
  test.use({ storageState: STAFF_STATE });

  test("has no Reports link and no stock-adjustment column", async ({ page, data }) => {
    await data.product({ stock: 5 });
    await page.goto("/inventory");
    await expect(page.getByRole("navigation").getByRole("link", { name: "Reports" })).toHaveCount(0);
    await expect(page.getByRole("columnheader", { name: "Adjust" })).toHaveCount(0);
  });

  // Hiding the link isn't enough; the page itself must turn staff away.
  test("cannot open /reports directly", async ({ page }) => {
    await page.goto("/reports");
    await expect(page).toHaveURL(/\/sales$/);
  });
});
