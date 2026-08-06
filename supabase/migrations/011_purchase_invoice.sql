-- OCR-driven invoice intake — distinct from purchase/purchase_item (001_initial_schema.sql,
-- extended in 007_orders.sql), which is the existing supplier-catalog purchase-order flow
-- (supplier_id FK, order_status, create_purchase_order/mark_purchase_delivered RPCs). Named
-- purchase_invoice/purchase_invoice_item specifically to avoid colliding with those tables and
-- the working feature behind them — "purchase" was already taken.
--
-- supplier_name is free text, not a supplier_id FK: OCR output won't reliably match an existing
-- supplier row, so it's captured as-read and left for staff to reconcile by hand if needed.
--
-- Schema only in this migration, per the requesting prompt — no RPC, no stock adjustment.
-- Confirming a draft and incrementing stock is deliberately left for a follow-up migration so
-- that step can reuse the same locked-batch-consumption pattern as create_sale/
-- prepare_wholesale_order/fulfill_wholesaler_order rather than being bolted on here.

CREATE TABLE purchase_invoice (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER REFERENCES branch(id),
  supplier_name TEXT,
  -- Object path within the private 'invoice-images' bucket below (e.g.
  -- "<branch_id>/<uuid>.jpg"), NOT a public URL — the bucket has no public read access, so the
  -- app generates a short-lived signed URL from this path server-side whenever the image is
  -- actually displayed. Required: this table only exists because there's a photographed
  -- invoice behind the row.
  invoice_image_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed')),
  created_at TIMESTAMP DEFAULT now(),
  created_by INTEGER REFERENCES app_user(id)
);

CREATE TABLE purchase_invoice_item (
  id SERIAL PRIMARY KEY,
  purchase_invoice_id INTEGER NOT NULL REFERENCES purchase_invoice(id),
  -- Null until staff resolves this line to a real product — an unresolved line is exactly why
  -- a purchase_invoice sits in 'draft' rather than 'confirmed'.
  product_id INTEGER REFERENCES product(id),
  raw_extracted_name TEXT,
  quantity INTEGER NOT NULL,
  unit_cost NUMERIC(10,2),
  matched BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_purchase_invoice_status ON purchase_invoice (status);
CREATE INDEX idx_purchase_invoice_item_purchase_invoice_id ON purchase_invoice_item (purchase_invoice_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE purchase_invoice TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE purchase_invoice_item TO service_role;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO service_role;

ALTER TABLE purchase_invoice ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_invoice_item ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Storage bucket for invoice photos
-- ---------------------------------------------------------------------------

-- Private bucket: these are photographed supplier invoices (pricing, business terms), not
-- public-facing content like the retail/wholesale catalogs. All app access already goes
-- through the service_role key server-side (see src/lib/supabase/server.ts,
-- PROJECT_SPEC.md), which bypasses RLS/bucket-privacy regardless — this just also prevents
-- anonymous direct access to raw invoice photos via a guessed/leaked object path.
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoice-images', 'invoice-images', false)
ON CONFLICT (id) DO NOTHING;
