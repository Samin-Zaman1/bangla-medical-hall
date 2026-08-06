# Bangla Medical Hall

Web-based POS and inventory system for a single pharmacy shop (Bangladesh). Built with Next.js, PostgreSQL (Supabase), and Prisma.

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
