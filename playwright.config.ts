import { defineConfig, devices, type Project } from "@playwright/test";
import { E2E, appServerEnv, remoteTarget } from "./tests/e2e/support/env";

const CI = !!process.env.CI;

// Desktop Chromium + a phone viewport on every run; Firefox and WebKit join when
// E2E_BROWSERS=all (the nightly workflow), since they double the runtime.
const browsers: Project[] = [
  { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  { name: "mobile", use: { ...devices["Pixel 7"] }, grep: /@mobile/ },
  ...(process.env.E2E_BROWSERS === "all"
    ? [
        { name: "firefox", use: { ...devices["Desktop Firefox"] } },
        { name: "webkit", use: { ...devices["Desktop Safari"] } },
      ]
    : []),
];

const smoke: Project = { name: "smoke", testMatch: /smoke\.spec\.ts/ };

const localProjects: Project[] = [
  { name: "setup", testMatch: /auth\.setup\.ts/ },
  smoke,
  ...browsers.map((p) => ({ ...p, dependencies: ["setup"], testIgnore: [/smoke\.spec\.ts/, /auth\.setup\.ts/] })),
];

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results/e2e",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  workers: CI ? 2 : undefined,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: CI
    ? [
        ["github"],
        ["list"],
        ["html", { open: "never", outputFolder: "playwright-report" }],
        ["junit", { outputFile: "test-results/e2e/junit.xml" }],
      ]
    : [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],

  globalSetup: remoteTarget ? undefined : "./tests/e2e/global-setup.ts",

  use: {
    baseURL: E2E.baseURL,
    locale: "en-GB",
    timezoneId: "Asia/Dhaka",
    trace: CI ? "on-first-retry" : "retain-on-failure",
    screenshot: "only-on-failure",
    video: CI ? "retain-on-failure" : "off",
    // Lets smoke tests through Vercel Deployment Protection on preview/production URLs.
    extraHTTPHeaders: process.env.VERCEL_AUTOMATION_BYPASS_SECRET
      ? {
          "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
          "x-vercel-set-bypass-cookie": "true",
        }
      : undefined,
  },

  projects: remoteTarget ? [smoke] : localProjects,

  // CI builds once in its own step and serves the production build; locally `next dev` is
  // reused if it's already running on the port.
  // E2E_DEV_SERVER=1 forces `next dev` in CI too. WebKit needs it: production cookies are
  // Secure, and WebKit (unlike Chromium/Firefox) won't store Secure cookies on http://localhost.
  webServer: remoteTarget
    ? undefined
    : {
        command:
          CI && !process.env.E2E_DEV_SERVER ? `npx next start --port ${E2E.port}` : `npx next dev --port ${E2E.port}`,
        url: `${E2E.baseURL}/login`,
        reuseExistingServer: !CI,
        timeout: 180_000,
        env: appServerEnv(),
        stdout: "ignore",
        stderr: "pipe",
      },
});
