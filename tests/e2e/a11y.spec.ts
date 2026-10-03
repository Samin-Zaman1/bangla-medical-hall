import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./support/fixtures";
import { OWNER_STATE } from "./support/seed";

// Automated WCAG 2.1 A/AA checks on the screens people use most. Gated on "critical" and
// "serious" violations; lesser ones are attached to the report for follow-up.
// KNOWN ISSUE, tracked separately below: the brand green (#059669) is 3.76:1 on white — under the
// 4.5:1 AA minimum for normal text. Excluded here so the gate still catches every other rule.
const KNOWN_ISSUES = ["color-contrast"];

async function audit(
  page: import("@playwright/test").Page,
  testInfo: import("@playwright/test").TestInfo,
  disabled: string[] = KNOWN_ISSUES,
) {
  // Audit the loaded screen, not a "Loading…" placeholder.
  await expect(page.getByText(/^Loading/)).toHaveCount(0);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .disableRules(disabled)
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

// Flip test.fail → test once --primary is darkened (e.g. emerald-700 #047857 is 5.5:1 on white).
test.fail("brand colours meet WCAG AA contrast", async ({ page }, testInfo) => {
  await page.goto("/wholesaler/login");
  await page.locator("main").first().waitFor();
  await audit(page, testInfo, []);
});
