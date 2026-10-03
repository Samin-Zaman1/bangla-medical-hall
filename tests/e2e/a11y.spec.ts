import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./support/fixtures";
import { OWNER_STATE } from "./support/seed";

// Automated WCAG 2.1 A/AA checks (including colour contrast) on the screens people use most.
// Gated on "critical" and "serious" violations; lesser ones are attached to the report for follow-up.
async function audit(page: import("@playwright/test").Page, testInfo: import("@playwright/test").TestInfo) {
  // Audit the loaded screen, not a "Loading…" placeholder.
  await expect(page.getByText(/^Loading/)).toHaveCount(0);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  await testInfo.attach("axe-results", { body: JSON.stringify(results.violations, null, 2), contentType: "application/json" });
  const blocking = results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => ({
      rule: `${v.id} (${v.impact}): ${v.help}`,
      elements: v.nodes
        .slice(0, 5)
        .map((n) => `${n.target.join(" ")} — ${n.failureSummary?.split("\n").slice(1).join(" ").trim()}`),
    }));
  expect(blocking, "serious/critical accessibility violations").toEqual([]);
}

for (const path of ["/login", "/shop", "/wholesaler/login", "/wholesaler/register"]) {
  test(`public page ${path} has no serious accessibility violations`, async ({ page }, testInfo) => {
    await page.goto(path);
    await page.locator("main").first().waitFor();
    await audit(page, testInfo);
  });
}

test.describe("signed in", () => {
  test.use({ storageState: OWNER_STATE });

  for (const path of ["/sales", "/inventory", "/products", "/customers"]) {
    test(`${path} has no serious accessibility violations`, async ({ page }, testInfo) => {
      await page.goto(path);
      await page.locator("main").first().waitFor();
      await audit(page, testInfo);
    });
  }
});
