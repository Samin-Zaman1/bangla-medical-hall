import { test as base, expect, type Page } from "@playwright/test";
import { connect, factories, type Factories, type Sql } from "./db";
import { pickerLabel, type SeedUser } from "./seed";

type WorkerFixtures = { sql: Sql; data: Factories };
type TestFixtures = { pageErrors: Error[] };

export const test = base.extend<TestFixtures, WorkerFixtures>({
  sql: [
    async ({}, use) => {
      const sql = connect();
      await use(sql);
      await sql.end();
    },
    { scope: "worker" },
  ],
  data: [async ({ sql }, use) => use(factories(sql)), { scope: "worker" }],

  // Every test fails if the page throws an uncaught error, even when the assertions pass.
  pageErrors: [
    async ({ page }, use) => {
      const errors: Error[] = [];
      page.on("pageerror", (err) => {
        // Tooling noise, not app bugs: next dev's hot-reload client dropping its connection, and
        // WebKit reporting a fetch cancelled by navigation as an "access control" error.
        if (/hmr-client|Error in input stream|due to access control checks/.test(err.message)) return;
        errors.push(err);
      });
      await use(errors);
      expect(errors, "uncaught errors in the page").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
export type { Page } from "@playwright/test";

export async function signIn(page: Page, user: SeedUser, pin = user.pin) {
  await gotoHydrated(page, "/login");
  await page.getByLabel("User").selectOption({ label: pickerLabel(user) });
  await page.getByLabel("PIN").fill(pin);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Opens a collapsed "Add …" section (its toggle shares a name with the form's submit button). */
export async function openSection(page: Page, label: string) {
  await page.getByRole("button", { name: label, expanded: false }).click();
}

/** The app's own error/status alerts — excludes Next.js's always-present route announcer. */
export const appAlert = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');

/**
 * Navigates and waits until React has hydrated the page's forms. Typing into server-rendered
 * inputs before hydration is lost when React takes over (slow devices, WebKit in dev mode).
 * React tags every hydrated DOM node with a `__reactProps$…` key.
 */
export async function gotoHydrated(page: Page, url: string) {
  await page.goto(url);
  await page.waitForFunction(() => {
    const nodes = document.querySelectorAll("form input, form button, main button");
    return nodes.length > 0 && [...nodes].every((n) => Object.keys(n).some((k) => k.startsWith("__reactProps")));
  });
}
