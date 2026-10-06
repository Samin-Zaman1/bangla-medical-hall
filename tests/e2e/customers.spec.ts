import { test, expect, gotoHydrated, openSection, type Page } from "./support/fixtures";
import { uniq } from "./support/db";
import { OWNER_STATE, STAFF_STATE } from "./support/seed";

const rowFor = (page: Page, text: string) => page.getByRole("row").filter({ hasText: text });

test.describe("owner", () => {
  test.use({ storageState: OWNER_STATE });

  test("adds a customer", async ({ page }) => {
    const name = uniq("Selina");
    await gotoHydrated(page, "/customers");
    await openSection(page, "Add customer");
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Phone").fill("01712345678");
    await page.locator("form").getByRole("button", { name: "Add customer" }).click();

    await expect(rowFor(page, name)).toContainText("01712345678");
  });

  test("records a baki repayment", async ({ page, data }) => {
    const customer = await data.customer({ credit: 250 });
    await gotoHydrated(page, "/customers");
    const row = rowFor(page, customer.name);

    await row.getByRole("button", { name: "record payment" }).click();
    await row.getByPlaceholder("amount").fill("100");
    await row.getByRole("button", { name: "Save" }).click();

    await expect(row).toContainText("150");
    expect(await data.creditOf(customer.id)).toBe(150);
  });

  test("refuses a repayment larger than what is owed", async ({ page, data }) => {
    const customer = await data.customer({ credit: 40 });
    await gotoHydrated(page, "/customers");
    const row = rowFor(page, customer.name);

    await row.getByRole("button", { name: "record payment" }).click();
    await row.getByPlaceholder("amount").fill("41");
    await row.getByRole("button", { name: "Save" }).click();

    await expect(row.getByText(/exceeds outstanding credit balance/)).toBeVisible();
    expect(await data.creditOf(customer.id)).toBe(40);
  });
});

test.describe("staff", () => {
  test.use({ storageState: STAFF_STATE });

  test("can see balances but not record repayments", async ({ page, data }) => {
    const customer = await data.customer({ credit: 75 });
    await gotoHydrated(page, "/customers");
    await expect(rowFor(page, customer.name)).toContainText("75");
    await expect(page.getByRole("columnheader", { name: "Payment" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "record payment" })).toHaveCount(0);
  });
});
