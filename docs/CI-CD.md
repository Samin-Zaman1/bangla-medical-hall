# CI/CD

```
 pull request ──► CI ───────────────┬─► Preview (Vercel preview + smoke + PR comment)
                  ├ Lint & typecheck  └─► CodeQL
                  ├ Unit/component/DB tests + coverage
                  ├ E2E: Supabase in Docker → build → Playwright
                  └ "CI passed"  ◄── require this in branch protection

 merge to master ──► CI ──(green)──► Deploy
                                      ├ Migrate production DB   (environment: production)
                                      ├ Deploy to Vercel        (environment: production)
                                      └ Smoke test live site ──(fail)──► automatic rollback

 every night ──► Nightly: all E2E on Chromium + Firefox + WebKit, npm audit → issue on failure
 every week  ──► Dependabot (grouped npm + Actions updates), CodeQL
```

| Workflow | File |
| --- | --- |
| CI | `.github/workflows/ci.yml` |
| Deploy (CD) | `.github/workflows/deploy.yml` |
| PR previews | `.github/workflows/preview.yml` |
| Nightly | `.github/workflows/nightly.yml` |
| CodeQL | `.github/workflows/codeql.yml` |

CI needs no secrets. Deploy and Preview **skip themselves** until the secrets below exist, so the
pipeline is safe to merge before any of this is set up.

## One-time setup

### 1. Vercel

1. Import the repo at vercel.com. Vercel's own Git auto-deploys are switched off in
   `vercel.json` (`git.deploymentEnabled: false`): GitHub Actions deploys instead, *after* tests pass.
2. **Settings → Environment Variables**:
   - **Production:** `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_SECRET`,
     `ANTHROPIC_API_KEY`, `SETUP_SECRET` — the production Supabase project.
   - **Preview:** the same names pointing at a **separate staging Supabase project**. Preview
     builds run unreviewed PR code; they must never hold production keys.
3. Create a token (Account → Tokens). Note the org and project IDs (`npx vercel link` writes them
   to `.vercel/project.json`).
4. Optional: if Deployment Protection is on, create a *Protection Bypass for Automation* secret.

### 2. Supabase

1. Create an access token (supabase.com → Account → Access Tokens); note the project ref and the
   database password.
2. **Baseline the migration history — required once, before the first deploy.** Migrations
   001–014 were run by hand in the SQL Editor, so Supabase has no record of them, and
   `db push` would try to run them all again. Mark the ones already applied:

   ```bash
   npx supabase link --project-ref <ref>
   npx supabase migration list            # "Remote" column is empty for all of them
   npx supabase migration repair --status applied 001 002 003 004 005 006 007 008 009 010 011 012 013
   # Add 014 too ONLY if 014_multi_item_sale.sql has already been run in production.
   npx supabase migration list            # now matches; anything left is what CD will apply
   ```

### 3. GitHub (Settings → Secrets and variables → Actions)

| Name | Kind | Value |
| --- | --- | --- |
| `VERCEL_TOKEN` | secret | Vercel token |
| `VERCEL_ORG_ID` | variable | from `.vercel/project.json` |
| `VERCEL_PROJECT_ID` | variable | from `.vercel/project.json` |
| `SUPABASE_ACCESS_TOKEN` | secret | Supabase access token |
| `SUPABASE_DB_PASSWORD` | secret | production DB password |
| `SUPABASE_PROJECT_REF` | variable | production project ref |
| `PRODUCTION_URL` | variable | e.g. `https://banglamedicalhall.com` (smoke tests use it) |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | secret | optional, see Vercel step 4 |

Then:

- **Settings → Environments → New environment `production`**: add yourself as a *required
  reviewer* so every release waits for a click, and restrict it to the `master` branch.
- **Settings → Branches → add rule for `master`**: require a pull request, require status check
  **"CI passed"**, require branches to be up to date, block force pushes.
- **Settings → Code security**: enable Dependabot alerts, secret scanning and push protection.

## Day to day

- Work on a branch, open a PR. CI, CodeQL and the preview run; the preview link appears as a comment.
- Merge when green. Deploy starts automatically and waits for your approval on the
  `production` environment, then migrates, deploys and smoke-tests.
- If smoke tests fail, the app is rolled back to the previous deployment automatically and the
  run is marked failed. Database migrations are **not** rolled back — see below.
- Manual release or re-run: **Actions → Deploy → Run workflow**.
- Manual rollback: Vercel dashboard → Deployments → previous one → *Promote to Production*
  (or `npx vercel rollback`).

## Migration rules

Because the app can be rolled back but the database can't, every migration must work with both
the **old** and the **new** app build:

1. **Never edit** a migration that has been applied anywhere. Add a new file.
2. **Expand, then contract.** Add the new column/function → deploy code that uses it → remove
   the old one in a later release. Never rename or drop in the same release that stops using it.
3. Changing an RPC's arguments creates a new overload; drop the old signature in the migration
   (as 013 and 014 do) only once no deployed build calls it.
4. New tables: `ENABLE ROW LEVEL SECURITY` and grant `service_role` (see 003, 007).
5. Mirror schema changes in `prisma/schema.prisma` (types only).
6. Test it: `npm run test:db` (PGlite) and `npm run db:local:reset && npm run test:e2e` (real Supabase).
