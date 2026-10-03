# Bangla Medical Hall

[![CI](https://github.com/Samin-Zaman1/bangla-medical-hall/actions/workflows/ci.yml/badge.svg)](https://github.com/Samin-Zaman1/bangla-medical-hall/actions/workflows/ci.yml) [![Deploy](https://github.com/Samin-Zaman1/bangla-medical-hall/actions/workflows/deploy.yml/badge.svg)](https://github.com/Samin-Zaman1/bangla-medical-hall/actions/workflows/deploy.yml)

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js) ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white) ![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase&logoColor=white) ![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)

Web-based point-of-sale and inventory system for a single pharmacy shop in Bangladesh. Built with Next.js, PostgreSQL (Supabase), and Prisma.

## The problem

Small pharmacies often run on paper: expiry dates are tracked by memory, customer credit (*baki*) lives in a notebook, and the owner can't see what's selling without counting shelves. This app replaces that with a system built around how the shop actually works.

## Features

- **Sales / POS**: sale flow with discounts, printable receipts and sales history
- **Batch-level inventory**: stock tracked per batch so expiry and cost stay accurate, plus stock adjustments
- **Credit (baki) tracking**: credit sales need approval; customer balances and repayments are recorded
- **Purchases & suppliers**: supplier catalogs, purchase orders and stock-in
- **AI invoice extraction**: photograph a supplier invoice, Claude extracts the line items, and staff match them to products and confirm before stock changes
- **Wholesaler portal**: wholesalers register, browse a catalog and place orders
- **Product requests**: staff log items customers asked for that aren't stocked
- **Owner reports**: sales and stock reporting, limited to the owner role
- **Role-based access**: PIN login with an owner/staff permission matrix (`src/lib/permissions.ts`) checked on API routes

## Product decisions

- **Phased delivery**: highest-value workflows first (sell → restock → credit → reports). See [Build phases](#build-phases).
- **Human review before AI writes data**: extracted invoice items land as a draft for staff to confirm. Model output is treated as untrusted, and malformed results are dropped instead of failing the request.
- **Supabase over HTTPS**: the shop's network blocks direct Postgres ports, so runtime data access goes through the Supabase client on port 443 (see `PROJECT_SPEC.md`).

## Setup

1. Copy environment variables:

   ```bash
   cp .env.example .env
   ```

2. Add your Supabase PostgreSQL connection string to `DATABASE_URL` in `.env`.

3. Apply the database schema (choose one):

   **Option A — Supabase SQL migration** (recommended for Supabase hosting):

   Run `supabase/migrations/001_initial_schema.sql` in the Supabase SQL editor, or via the Supabase CLI.

   **Option B — Prisma push** (local dev / Prisma-managed schema):

   ```bash
   npm run db:push
   ```

4. Generate the Prisma client and start the dev server:

   ```bash
   npm install
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000) — you'll be redirected to `/login`.

## Testing & delivery

```bash
npm test               # unit + component + DB tests (no setup needed, ~10 s)
npm run db:local:start # local Supabase in Docker, all migrations applied
npm run test:e2e       # Playwright end-to-end suite against it
```

Every pull request runs lint, typecheck, all test layers and a full browser E2E run; merges to
`master` are migrated, deployed to Vercel and smoke-tested automatically. See
[docs/TESTING.md](docs/TESTING.md) and [docs/CI-CD.md](docs/CI-CD.md).

## Project structure

```
src/
├── app/
│   ├── (auth)/login/          # PIN login (Phase 1)
│   ├── (dashboard)/           # Main app shell + feature pages
│   └── api/                   # REST-style API routes
├── lib/
│   ├── auth/session.ts        # Session helpers
│   ├── db.ts                  # Prisma client singleton
│   └── permissions.ts         # Role-based permission matrix
└── types/                     # Shared TypeScript types
prisma/schema.prisma           # Prisma schema (mirrors PROJECT_SPEC)
supabase/migrations/           # Raw SQL for Supabase deployment
```

## Build phases

See `PROJECT_SPEC.md` for full requirements. Implementation order:

1. Branch + app_user + PIN auth
2. Product + batch CRUD
3. Sale flow
4. Stock-in / purchases
5. Credit (baki) system
6. Product requests
7. Owner reports
8. Slow-mover report
9. Stock reconciliation

## Tech stack

- **Next.js 16** (App Router, API routes)
- **PostgreSQL** on Supabase
- **Prisma** ORM
- **Tailwind CSS**
- **Vercel** (hosting)
