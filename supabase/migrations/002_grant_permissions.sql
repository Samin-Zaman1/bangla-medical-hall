-- Grant service-role access to the core tables so server-side Supabase access can query them.
-- Run this in the Supabase SQL Editor.

GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.branch TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_user TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.customer TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.supplier TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.batch TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.purchase TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.purchase_item TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sale TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sale_item TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.credit_payment TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.stock_movement TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.controlled_substance_log TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_request TO service_role;

GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO service_role;
