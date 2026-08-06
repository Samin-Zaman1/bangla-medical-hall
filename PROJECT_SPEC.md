# Pharmacy POS & Inventory — Project Specification

## Database access architecture

This project uses the Supabase JavaScript client (`@supabase/supabase-js`) for application data access.

### Why this approach

The environment has a network constraint where direct PostgreSQL ports `5432` and `6543` are blocked, but HTTPS on port `443` works correctly. Because of that, the project uses Supabase over HTTPS instead of direct Postgres or Prisma database connections for runtime data access.

### Data access rules

- Client-side/browser access uses the Supabase JS client with the `anon` key and Row Level Security (RLS) policies once authentication is implemented.
- Server-side API routes use the Supabase JS client with the `service_role` key for privileged operations.
- Prisma and direct Postgres TCP connections are not the primary runtime path for this project.

### Implementation notes

- Use the Supabase REST/Realtime client for app data access.
- Keep database access inside server API routes or server-side utilities when privileged operations are required.
- Define RLS policies for tables such as `branch`, `customer`, `product`, `sale`, and related data as the app evolves.
- Treat Supabase as the system of record for runtime data operations in this project.
