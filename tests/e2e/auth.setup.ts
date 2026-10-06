import { test as setup, expect } from "@playwright/test";
import { signIn } from "./support/fixtures";
import { OWNER, OWNER_STATE, STAFF, STAFF_STATE } from "./support/seed";

// Signs in once per role through the real login form and saves the cookies, so the specs start
// already authenticated instead of repeating the login flow in every test.
for (const [user, state] of [
  [OWNER, OWNER_STATE],
  [STAFF, STAFF_STATE],
] as const) {
  setup(`sign in as ${user.role}`, async ({ page }) => {
    await signIn(page, user);
    await expect(page).toHaveURL(/\/sales$/);
    await page.context().storageState({ path: state });
  });
}
