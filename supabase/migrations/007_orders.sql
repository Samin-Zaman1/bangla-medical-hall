-- Supplier purchase orders + wholesale customer orders.
--
-- Naming convention for new RPCs below: RETURNS TABLE columns are prefixed `out_` so they can
-- never collide with a real table column name. A prior migration (005) hit a real bug from
-- this exact collision (RETURNS TABLE(quantity INTEGER) shadowing the `batch.quantity` column,
-- making bare "quantity" reads ambiguous) — this convention avoids the whole bug class instead
-- of relying on remembering to qualify every reference.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

-- Per-supplier product catalog: "these are the products Acme supplies, at what cost."
CREATE TABLE supplier_product (
  id SERIAL PRIMARY KEY,
  supplier_id INTEGER NOT NULL REFERENCES supplier(id),
  product_id INTEGER NOT NULL REFERENCES product(id),
  cost_price NUMERIC(10,2),
  UNIQUE (supplier_id, product_id)
);

-- Delivery status, independent of the existing payment_status (due/paid).
ALTER TABLE purchase ADD COLUMN order_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (order_status IN ('pending', 'delivered', 'cancelled'));
ALTER TABLE purchase ALTER COLUMN payment_status SET DEFAULT 'due';

-- Items are ordered by product before any batch exists; batch_id (already nullable) gets
-- populated by mark_purchase_delivered() below once the shipment arrives.
ALTER TABLE purchase_item ADD COLUMN product_id INTEGER REFERENCES product(id);

CREATE TABLE wholesale_order (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER REFERENCES branch(id),
  customer_id INTEGER REFERENCES customer(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'prepared', 'paid', 'cancelled')),
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  sale_id INTEGER REFERENCES sale(id),
  created_by INTEGER REFERENCES app_user(id),
  payment_method TEXT CHECK (payment_method IN ('cash', 'bkash', 'nagad', 'credit')),
  created_at TIMESTAMP DEFAULT now(),
  prepared_at TIMESTAMP,
  paid_at TIMESTAMP
);

CREATE TABLE wholesale_order_item (
  id SERIAL PRIMARY KEY,
  wholesale_order_id INTEGER REFERENCES wholesale_order(id),
  product_id INTEGER REFERENCES product(id),
  quantity INTEGER NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE supplier_product TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE wholesale_order TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE wholesale_order_item TO service_role;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO service_role;

ALTER TABLE supplier_product ENABLE ROW LEVEL SECURITY;
ALTER TABLE wholesale_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE wholesale_order_item ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Supplier purchase orders
-- ---------------------------------------------------------------------------

-- p_items: [{"product_id": 1, "quantity": 10, "cost_price": 5.00}, ...] — cost_price optional,
-- falls back to the supplier's catalog price. Every product must already be in this supplier's
-- catalog (supplier_product) or the whole order is rejected.
CREATE OR REPLACE FUNCTION public.create_purchase_order(
  p_branch_id INTEGER,
  p_supplier_id INTEGER,
  p_user_id INTEGER,
  p_items JSONB
) RETURNS TABLE (
  out_purchase_id INTEGER,
  out_total_amount NUMERIC
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_purchase_id INTEGER;
  v_total NUMERIC := 0;
  v_item JSONB;
  v_product_id INTEGER;
  v_quantity INTEGER;
  v_cost_price NUMERIC;
  v_catalog_cost NUMERIC;
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one item is required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM supplier s WHERE s.id = p_supplier_id) THEN
    RAISE EXCEPTION 'Supplier not found';
  END IF;

  INSERT INTO purchase (branch_id, supplier_id, date, total_amount, payment_status, order_status, logged_by)
  VALUES (p_branch_id, p_supplier_id, CURRENT_DATE, 0, 'due', 'pending', p_user_id)
  RETURNING id INTO v_purchase_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::INTEGER;
    v_quantity := (v_item->>'quantity')::INTEGER;

    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'Quantity must be a positive integer for product %', v_product_id;
    END IF;

    SELECT sp.cost_price INTO v_catalog_cost
    FROM supplier_product sp
    WHERE sp.supplier_id = p_supplier_id AND sp.product_id = v_product_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % is not in this supplier''s catalog', v_product_id;
    END IF;

    v_cost_price := COALESCE((v_item->>'cost_price')::NUMERIC, v_catalog_cost, 0);

    INSERT INTO purchase_item (purchase_id, product_id, quantity, cost_price)
    VALUES (v_purchase_id, v_product_id, v_quantity, v_cost_price);

    v_total := v_total + (v_cost_price * v_quantity);
  END LOOP;

  UPDATE purchase p SET total_amount = v_total WHERE p.id = v_purchase_id;

  RETURN QUERY SELECT v_purchase_id, v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_purchase_order(INTEGER, INTEGER, INTEGER, JSONB) TO service_role;

-- p_batch_overrides (optional): [{"purchase_item_id": 5, "batch_number": "BN1", "expiry_date": "2027-01-01"}, ...]
-- Creates one batch per purchase_item, links it, and logs a stock_movement('in') — atomically.
CREATE OR REPLACE FUNCTION public.mark_purchase_delivered(
  p_purchase_id INTEGER,
  p_branch_id INTEGER,
  p_user_id INTEGER,
  p_batch_overrides JSONB
) RETURNS TABLE (
  out_purchase_id INTEGER,
  out_order_status TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_supplier_id INTEGER;
  v_current_status TEXT;
  v_item RECORD;
  v_batch_number TEXT;
  v_expiry_date DATE;
  v_batch_id INTEGER;
BEGIN
  SELECT p.supplier_id, p.order_status INTO v_supplier_id, v_current_status
  FROM purchase p
  WHERE p.id = p_purchase_id AND p.branch_id = p_branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase order not found';
  END IF;

  IF v_current_status <> 'pending' THEN
    RAISE EXCEPTION 'Purchase order is not pending (current status: %)', v_current_status;
  END IF;

  FOR v_item IN
    SELECT pi.id, pi.product_id, pi.quantity, pi.cost_price
    FROM purchase_item pi
    WHERE pi.purchase_id = p_purchase_id
  LOOP
    v_batch_number := NULL;
    v_expiry_date := NULL;

    IF p_batch_overrides IS NOT NULL THEN
      SELECT (elem->>'batch_number'), NULLIF(elem->>'expiry_date', '')::DATE
      INTO v_batch_number, v_expiry_date
      FROM jsonb_array_elements(p_batch_overrides) elem
      WHERE (elem->>'purchase_item_id')::INTEGER = v_item.id
      LIMIT 1;
    END IF;

    INSERT INTO batch (branch_id, product_id, supplier_id, batch_number, expiry_date, cost_price, quantity)
    VALUES (p_branch_id, v_item.product_id, v_supplier_id, v_batch_number, v_expiry_date, v_item.cost_price, v_item.quantity)
    RETURNING id INTO v_batch_id;

    UPDATE purchase_item pi SET batch_id = v_batch_id WHERE pi.id = v_item.id;

    INSERT INTO stock_movement (branch_id, batch_id, type, quantity, reason, user_id)
    VALUES (p_branch_id, v_batch_id, 'in', v_item.quantity, 'purchase_delivered', p_user_id);
  END LOOP;

  UPDATE purchase p SET order_status = 'delivered' WHERE p.id = p_purchase_id;

  RETURN QUERY SELECT p_purchase_id, 'delivered'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_purchase_delivered(INTEGER, INTEGER, INTEGER, JSONB) TO service_role;

-- ---------------------------------------------------------------------------
-- Wholesale customer orders
-- ---------------------------------------------------------------------------

-- p_items: [{"product_id": 1, "quantity": 5, "unit_price": 3.00}, ...] — unit_price optional,
-- falls back to product.sale_price. No stock is touched here (see prepare_wholesale_order).
CREATE OR REPLACE FUNCTION public.create_wholesale_order(
  p_branch_id INTEGER,
  p_customer_id INTEGER,
  p_user_id INTEGER,
  p_items JSONB
) RETURNS TABLE (
  out_order_id INTEGER,
  out_total_amount NUMERIC
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_id INTEGER;
  v_total NUMERIC := 0;
  v_item JSONB;
  v_product_id INTEGER;
  v_quantity INTEGER;
  v_unit_price NUMERIC;
  v_default_price NUMERIC;
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one item is required';
  END IF;

  IF p_customer_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM customer c WHERE c.id = p_customer_id) THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;

  INSERT INTO wholesale_order (branch_id, customer_id, status, total_amount, created_by)
  VALUES (p_branch_id, p_customer_id, 'pending', 0, p_user_id)
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::INTEGER;
    v_quantity := (v_item->>'quantity')::INTEGER;

    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'Quantity must be a positive integer for product %', v_product_id;
    END IF;

    SELECT pr.sale_price INTO v_default_price FROM product pr WHERE pr.id = v_product_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % not found', v_product_id;
    END IF;

    v_unit_price := COALESCE((v_item->>'unit_price')::NUMERIC, v_default_price);

    INSERT INTO wholesale_order_item (wholesale_order_id, product_id, quantity, unit_price)
    VALUES (v_order_id, v_product_id, v_quantity, v_unit_price);

    v_total := v_total + (v_unit_price * v_quantity);
  END LOOP;

  UPDATE wholesale_order wo SET total_amount = v_total WHERE wo.id = v_order_id;

  RETURN QUERY SELECT v_order_id, v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_wholesale_order(INTEGER, INTEGER, INTEGER, JSONB) TO service_role;

-- Multi-item version of create_sale's FEFO loop (supabase/migrations/004_sale_rpc.sql):
-- consumes batches earliest-expiry-first per product, splitting across batches when needed,
-- across ALL order items in one sale + one transaction. If any single item can't be fully
-- covered, the whole thing rolls back — no partial stock decrement.
CREATE OR REPLACE FUNCTION public.prepare_wholesale_order(
  p_order_id INTEGER,
  p_branch_id INTEGER,
  p_user_id INTEGER
) RETURNS TABLE (
  out_order_id INTEGER,
  out_sale_id INTEGER,
  out_status TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_status TEXT;
  v_customer_id INTEGER;
  v_total NUMERIC;
  v_sale_id INTEGER;
  v_receipt TEXT;
  v_item RECORD;
  v_available INTEGER;
  v_remaining INTEGER;
  v_take INTEGER;
  v_batch RECORD;
BEGIN
  SELECT wo.status, wo.customer_id, wo.total_amount INTO v_current_status, v_customer_id, v_total
  FROM wholesale_order wo
  WHERE wo.id = p_order_id AND wo.branch_id = p_branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wholesale order not found';
  END IF;

  IF v_current_status <> 'pending' THEN
    RAISE EXCEPTION 'Order is not pending (current status: %)', v_current_status;
  END IF;

  v_receipt := 'WS-' || extract(epoch from clock_timestamp())::bigint || '-' || p_user_id;

  INSERT INTO sale (branch_id, user_id, customer_id, subtotal, total_amount, payment_method, receipt_number)
  VALUES (p_branch_id, p_user_id, v_customer_id, v_total, v_total, 'cash', v_receipt)
  RETURNING id INTO v_sale_id;

  FOR v_item IN
    SELECT woi.id, woi.product_id, woi.quantity, woi.unit_price
    FROM wholesale_order_item woi
    WHERE woi.wholesale_order_id = p_order_id
  LOOP
    WITH locked AS (
      SELECT b.quantity
      FROM batch b
      WHERE b.product_id = v_item.product_id AND b.branch_id = p_branch_id AND b.quantity > 0
      ORDER BY b.expiry_date ASC NULLS LAST
      FOR UPDATE
    )
    SELECT COALESCE(SUM(quantity), 0) INTO v_available FROM locked;

    IF v_available < v_item.quantity THEN
      RAISE EXCEPTION 'Insufficient stock for product % (need %, have %)', v_item.product_id, v_item.quantity, v_available;
    END IF;

    v_remaining := v_item.quantity;

    FOR v_batch IN
      SELECT b.id, b.quantity
      FROM batch b
      WHERE b.product_id = v_item.product_id AND b.branch_id = p_branch_id AND b.quantity > 0
      ORDER BY b.expiry_date ASC NULLS LAST
    LOOP
      EXIT WHEN v_remaining <= 0;

      v_take := LEAST(v_batch.quantity, v_remaining);

      INSERT INTO sale_item (sale_id, batch_id, quantity, price_at_sale)
      VALUES (v_sale_id, v_batch.id, v_take, v_item.unit_price);

      UPDATE batch b SET quantity = b.quantity - v_take WHERE b.id = v_batch.id;

      INSERT INTO stock_movement (branch_id, batch_id, type, quantity, reason, user_id)
      VALUES (p_branch_id, v_batch.id, 'out', v_take, 'wholesale_order', p_user_id);

      v_remaining := v_remaining - v_take;
    END LOOP;
  END LOOP;

  UPDATE wholesale_order wo
  SET status = 'prepared', sale_id = v_sale_id, prepared_at = now()
  WHERE wo.id = p_order_id;

  RETURN QUERY SELECT p_order_id, v_sale_id, 'prepared'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.prepare_wholesale_order(INTEGER, INTEGER, INTEGER) TO service_role;
