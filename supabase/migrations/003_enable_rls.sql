-- Enable RLS with no policies on every app table. This is a default-deny gate for the
-- anon/authenticated Postgres roles; it does not affect service_role, which bypasses RLS
-- entirely, so all current server-side API routes (which use service_role) keep working.
-- The intent is defense-in-depth: if a client-side anon-key path is ever added, it starts
-- fully locked out until explicit policies are written for it (see PROJECT_SPEC.md).
-- Run this in the Supabase SQL Editor after 001 and 002.

ALTER TABLE public.branch ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_user ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_payment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movement ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.controlled_substance_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_request ENABLE ROW LEVEL SECURITY;
