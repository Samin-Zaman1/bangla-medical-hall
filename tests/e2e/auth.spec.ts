import { test, expect, signIn, appAlert } from "./support/fixtures";
import { LOCKOUT_TESTER, OWNER, OWNER_STATE, PIN_TESTER, STAFF, pickerLabel } from "./support/seed";

test.describe("signing in", () => {
  test("lists staff in the user picker", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    const picker = page.getByLabel("User");
    await expect(picker.getByRole("option", { name: pickerLabel(OWNER) })).toBeAttached();
    await expect(picker.getByRole("option", { name: pickerLabel(STAFF) })).toBeAttached();
  });

  test("a visitor to a protected page is sent to login and returned there afterwards", async ({ page }) => {
    await page.goto("/inventory");
    await expect(page).toHaveURL(/\/login\?from=%2Finventory$/);

    await page.getByLabel("User").selectOption({ label: pickerLabel(STAFF) });
    await page.getByLabel("PIN").fill(STAFF.pin);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/inventory$/);
    await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible();
  });

  test("a wrong PIN is rejected without saying which part was wrong", async ({ page }) => {
    await signIn(page, PIN_TESTER, "0000");
    await expect(appAlert(page)).toHaveText("Invalid credentials");
    await expect(page).toHaveURL(/\/login/);
  });

  test("repeated wrong PINs lock the account, even against the right PIN", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("User").selectOption({ label: pickerLabel(LOCKOUT_TESTER) });
    const pin = page.getByLabel("PIN");
    const alert = appAlert(page);

    async function attempt(value: string) {
      await pin.fill(value);
      const response = page.waitForResponse((r) => r.url().endsWith("/api/auth") && r.request().method() === "POST");
      await page.getByRole("button", { name: "Sign in" }).click();
      return (await response).status();
    }

    // Up to 6 tries: on a CI retry the account may already be locked from the first attempt.
    let status = 0;
    for (let i = 0; i < 6 && status !== 429; i++) status = await attempt("0000");
    expect(status).toBe(429);
    await expect(alert).toContainText("Too many failed attempts");

    expect(await attempt(LOCKOUT_TESTER.pin)).toBe(429);
    await expect(alert).toContainText("Too many failed attempts");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("signed in", () => {
  test.use({ storageState: OWNER_STATE });

  test("visiting /login bounces to the till", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/sales$/);
  });

  test("signing out ends the session", async ({ page, context }) => {
    // Sign in fresh rather than signing out the shared owner session other tests rely on.
    await context.clearCookies();
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/sales$/);

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/sales");
    await expect(page).toHaveURL(/\/login\?from=%2Fsales$/);
  });
});
