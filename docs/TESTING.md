# Testing

Four layers, cheapest first. Each catches a different kind of bug, so put a new test at the
lowest layer that can see the behaviour.

| Layer | Command | Runs against | Use it for |
| --- | --- | --- | --- |
| **Unit** | `npm run test:unit` | Node, Supabase + cookies mocked | Permission rules, session tokens, the proxy (middleware), API route validation and error → HTTP status mapping |
| **Component** | `npm run test:components` | jsdom + Testing Library | Client components: cart maths, form rules, what's shown to whom |
| **DB** | `npm run test:db` | Every migration applied to an in-process Postgres (PGlite) | The plpgsql RPCs that own stock, money and credit — FEFO, rollbacks, balances, branch isolation, RLS |
| **E2E** | `npm run test:e2e` | Real browser → real Next server → local Supabase (Docker) | User journeys end to end, role boundaries over HTTP, accessibility |

`npm test` runs the first three (~10 s, no Docker). `npm run test:all` runs everything.

## Running E2E locally

One-time: install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and `npx playwright install chromium`.

```bash
npm run db:local:start   # Postgres + PostgREST + Storage with every migration applied
npm run test:e2e         # starts `next dev` on :3100 automatically
npm run test:e2e:ui      # interactive mode: watch, time-travel, pick locators
npm run test:e2e:report  # open the last HTML report (traces for failures)
npm run db:local:stop
```

- Every run **wipes and reseeds** the local database (`tests/e2e/global-setup.ts`). The suite
  refuses to run if the database URL isn't localhost, so it can't touch production even if
  `.env.local` points there — the test server gets its env from `tests/e2e/support/env.ts`.
- Seeded logins (local only): **Ayesha Owner / 1111**, **Rafi Staff / 2222**.
- Studio isn't started by default; `npx supabase start` (no `-x`) adds it on http://127.0.0.1:54323.

### Projects

| Project | What | When |
| --- | --- | --- |
| `setup` | Signs in owner + staff through the UI, saves sessions | Before browser projects |
| `chromium` | Every spec | Every PR |
| `mobile` | `@mobile`-tagged specs on a Pixel 7 viewport | Every PR |
| `smoke` | Read-only checks, safe against production | Every PR, and after every deploy |
| `firefox`, `webkit` | Every spec | Nightly (`E2E_BROWSERS=all`) |

Smoke against any deployed URL: `E2E_BASE_URL=https://your-site npx playwright test --project=smoke`.

## Writing E2E tests

- Import `test`/`expect` from `tests/e2e/support/fixtures.ts`. It adds:
  - `data` — factories that insert uniquely named products/customers and read back stock and
    credit, so tests run in parallel without seeing each other's rows;
  - `sql` — a raw connection for assertions the UI can't show;
  - automatic failure on any uncaught error in the page.
- Start authenticated with `test.use({ storageState: OWNER_STATE })` (or `STAFF_STATE`).
- Locate by role and label (`getByRole`, `getByLabel`) — the way users and screen readers find
  things. If a control has no accessible name, give it one in the component; don't reach for CSS.
- Assert outcomes in the database too (`await expect.poll(() => data.stockOf(id)).toBe(36)`), not
  just on screen.
- Use `appAlert(page)` for error messages (Next.js renders its own hidden `role="alert"`).

## Known issues tracked by tests

These are real bugs, written as `test.fail` / `it.fails` so CI stays green while they're open.
When one is fixed, its test starts **failing** ("expected to fail but passed") — that's the cue to
turn it into a normal test.

| Issue | Test |
| --- | --- |
| Dashboard isn't responsive: on phones the sidebar covers the till | `tests/e2e/sales.spec.ts` (mobile project) |
| Brand green `#059669` is 3.76:1 on white (AA needs 4.5:1) | `tests/e2e/a11y.spec.ts` |
| `/reports` has no page-level permission check | `tests/e2e/permissions.spec.ts` |
| Proxy accepts a wholesaler token in the staff cookie (handlers still reject it) | `tests/unit/proxy.test.ts` |
