# Claude handoff context for Bangla Medical Hall

## Project summary
This project is a Next.js 16 app using the App Router and TypeScript. The runtime data layer uses Supabase over HTTPS. The app currently has a working MVP foundation for auth, role-based access, products, and basic sales.

## Current architecture
- Framework: Next.js 16 (App Router)
- Language: TypeScript
- Data layer: Supabase JS client with service-role credentials on the server
- Auth: JWT-based session cookie stored in an HTTP-only cookie
- PIN auth: owner/staff users are stored in Supabase in the app_user table with hashed PIN values
- Routing: dashboard pages are protected by middleware; auth and setup endpoints are intentionally whitelisted for bootstrap

## What is already implemented
### Authentication and access control
- File: src/app/api/auth/route.ts
- File: src/lib/auth/password.ts
- File: src/lib/auth/session.ts
- File: src/lib/auth/require-auth.ts
- File: src/lib/permissions.ts
- File: src/middleware.ts
- File: src/components/auth/login-form.tsx
- File: src/app/(auth)/login/page.tsx

Implemented behavior:
- PIN login endpoint at /api/auth
- Session cookie creation and validation
- Middleware-based protection for dashboard routes
- Basic permission checks via requirePermission("process_sale")
- CSRF-style origin checking on unsafe API requests in middleware

### Setup and bootstrapping
- File: src/app/api/setup/seed/route.ts
- File: src/app/api/setup/products/route.ts
- File: src/lib/setup-guard.ts

Implemented behavior:
- Seeds an initial branch and owner user
- Hashes the PIN before storing it
- Seeds starter products into the product table
- Setup endpoint is guarded by a simple environment-based allow-list

### Products flow
- File: src/app/api/products/route.ts
- File: src/app/(dashboard)/products/page.tsx

Implemented behavior:
- Reads products from Supabase
- Displays them on the products page

### Sales flow
- File: src/app/api/sales/route.ts
- File: src/app/(dashboard)/sales/page.tsx

Implemented behavior:
- Reads products from Supabase
- Accepts a productId and quantity in JSON
- Calls a Supabase RPC named create_sale
- Creates sale and sale_item rows, returning a receipt payload
- Uses branchId and userId from the authenticated session

## Important implementation details
### Supabase RPC for sales
The sales API currently relies on a database RPC called create_sale. The expected RPC behavior is:
- Validate that the product exists
- Validate that the requested quantity is positive
- Create a sale row for the current branch/user
- Create a sale_item row with the sale price
- Return sale_id, subtotal, total_amount, and receipt_number

If the RPC is missing, the sales route will fail with a server error. That is the next likely breakpoint if the app is moved further.

### Database assumptions
The app expects the following tables to exist:
- branch
- app_user
- product
- sale
- sale_item

The initial schema is in supabase/migrations/001_initial_schema.sql.

## Local environment
The local environment file is .env.local and contains the Supabase plus auth settings.

Required variables:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
- SUPABASE_SERVICE_ROLE_KEY
- AUTH_SECRET

## Verified behavior
The following flows were verified successfully during implementation:
- Setup seed endpoint creates a branch and owner user
- Login endpoint creates a session cookie
- Product seed endpoint populates starter products
- Sales POST returns HTTP 200 and creates a sale record

## Current caveats
- The app still uses a simple MVP approach rather than full production polish.
- The sales flow depends on the create_sale RPC existing in Supabase.
- The login and setup endpoints are intentionally flexible for bootstrapping.
- Browser-side RLS is not yet the main access pattern; server-side routes use service-role credentials.

## Recommended next steps
1. Add a real sales history/receipts view
2. Add product create/edit UI
3. Add inventory/batch handling
4. Add stronger role/permission coverage to additional routes
5. If needed, add the create_sale RPC to Supabase directly instead of relying on a client-side assumption

## Quick file map
- App shell: src/app/layout.tsx
- Login page: src/app/(auth)/login/page.tsx
- Products page: src/app/(dashboard)/products/page.tsx
- Sales page: src/app/(dashboard)/sales/page.tsx
- Auth API: src/app/api/auth/route.ts
- Setup seed API: src/app/api/setup/seed/route.ts
- Product seed API: src/app/api/setup/products/route.ts
- Sales API: src/app/api/sales/route.ts
- Middleware: src/middleware.ts
- Auth helpers: src/lib/auth/*
- Supabase helper: src/lib/supabase/server.ts
