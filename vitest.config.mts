import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Three projects, each runnable on its own (`npm run test:unit` etc.):
//   unit       — pure lib code, the proxy, and API route handlers (Supabase + cookies mocked)
//   components — client components rendered in jsdom with Testing Library
//   db         — the real supabase/migrations applied to an in-process Postgres (PGlite), so the
//                plpgsql RPCs that hold the stock/credit logic are exercised for real. No Docker.
export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reportOnFailure: true,
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.d.ts", "src/Images/**"],
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
          setupFiles: ["tests/setup/unit.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "components",
          environment: "jsdom",
          include: ["tests/components/**/*.test.tsx"],
          setupFiles: ["tests/setup/components.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "db",
          environment: "node",
          include: ["tests/db/**/*.test.ts"],
          // Booting Postgres (WASM) and applying every migration takes a few seconds per file.
          hookTimeout: 60_000,
          testTimeout: 20_000,
        },
      },
    ],
  },
});
