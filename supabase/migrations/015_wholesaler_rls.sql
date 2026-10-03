-- 009_wholesaler.sql created the wholesaler table (emails + password hashes) without enabling
-- row level security. Supabase grants the anon role access to new public tables by default, so
-- anyone holding the public anon key could read it through the REST API.
--
-- Same default-deny pattern as 003_enable_rls.sql: RLS on, no policies. service_role (used by
-- every server-side route) bypasses RLS, so the app is unaffected.

ALTER TABLE public.wholesaler ENABLE ROW LEVEL SECURITY;

-- Explicit grant, matching the other tables, instead of relying on Supabase's default privileges.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.wholesaler TO service_role;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO service_role;
