-- Wholesaler self-service orders — distinct from wholesale_order/wholesale_order_item
-- (007_orders.sql), which is staff manually recording bulk sales to a Customer. This is an
-- external wholesaler account (see 009_wholesaler.sql) submitting a restock request. Named
-- wholesaler_order (singular "wholesaler", matching the wholesaler table) specifically to avoid
-- colliding with the existing wholesale_order tables and the feature they back.
--
-- fulfilled_quantity on wholesaler_order_item (beyond product_id/quantity/unit_price/subtotal)
-- exists so "partially_fulfilled" is queryable per item, not just an order-level label — staff
-- confirm exactly how much of each item to release (see fulfill_wholesaler_order below), and
-- that confirmed amount is recorded here.
--
-- unit_price/subtotal are captured once at order-submission time from product.wholesale_price
-- and never re-read later, so a later price change doesn't retroactively alter a placed order.
--
-- No branch_id here: the wholesaler has no branch context when ordering (same reasoning as the
-- public retail catalog aggregating stock across all branches). Fulfillment instead takes the
-- fulfilling staff member's own branch as an RPC parameter, same as create_sale/
-- prepare_wholesale_order already do.
--
-- No 'cancelled' status: cancellation wasn't requested for this feature, so it isn't built.

CREATE TABLE wholesaler_order (
  id SERIAL PRIMARY KEY,
  wholesaler_id INTEGER NOT NULL REFERENCES wholesaler(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'fulfilled', 'partially_fulfilled')),
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  sale_id INTEGER REFERENCES sale(id),
  fulfilled_by INTEGER REFERENCES app_user(id),
  created_at TIMESTAMP DEFAULT now(),
  fulfilled_at TIMESTAMP
);

CREATE TABLE wholesaler_order_item (
  id SERIAL PRIMARY KEY,
  wholesaler_order_id INTEGER NOT NULL REFERENCES wholesaler_order(id),
  product_id INTEGER NOT NULL REFERENCES product(id),
  quantity INTEGER NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL,
  subtotal NUMERIC(12,2) NOT NULL,
  fulfilled_quantity INTEGER NOT NULL DEFAULT 0
);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE wholesaler_order TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE wholesaler_order_item TO service_role;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO service_role;

ALTER TABLE wholesaler_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE wholesaler_order_item ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Order submission
-- ---------------------------------------------------------------------------

-- p_items: [{"product_id": 1, "quantity": 10}, ...] — no client-supplied price: unlike
-- create_wholesale_order (which trusts staff to optionally override price), this is a
-- self-service endpoint for an external account, so unit_price is ALWAYS read server-side from
-- product.wholesale_price and any client-sent price is ignored/not accepted at all.
--
-- Validates every item (price availability + current stock) before inserting anything. If any
-- item is short, the whole order is rejected with one message listing every short item — not
-- just the first one hit — so the wholesaler can adjust quantities and resubmit. This check is
-- a plain unlocked read (nothing is being reserved yet); the authoritative, race-safe check
-- happens later in fulfill_wholesaler_order.
CREATE OR REPLACE FUNCTION public.create_wholesaler_order(
  p_wholesaler_id INTEGER,
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
  v_product_name TEXT;
  v_available INTEGER;
  v_shortfall TEXT := '';
  v_subtotal NUMERIC;
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one item is required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM wholesaler w WHERE w.id = p_wholesaler_id) THEN
    RAISE EXCEPTION 'Wholesaler not found';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::INTEGER;
    v_quantity := (v_item->>'quantity')::INTEGER;

    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'Quantity must be a positive integer for product %', v_product_id;
    END IF;

    SELECT pr.generic_name, pr.wholesale_price INTO v_product_name, v_unit_price
    FROM product pr WHERE pr.id = v_product_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % not found', v_product_id;
    END IF;
    IF v_unit_price IS NULL THEN
      RAISE EXCEPTION '% is not available for wholesale ordering', v_product_name;
    END IF;

    SELECT COALESCE(SUM(b.quantity), 0) INTO v_available
    FROM batch b WHERE b.product_id = v_product_id AND b.quantity > 0;

    IF v_available < v_quantity THEN
      v_shortfall := v_shortfall || format('%s (need %s, have %s); ', v_product_name, v_quantity, v_available);
    END IF;
  END LOOP;

  IF v_shortfall <> '' THEN
    RAISE EXCEPTION 'Insufficient stock: %', rtrim(v_shortfall, '; ');
  END IF;

  INSERT INTO wholesaler_order (wholesaler_id, status, total_amount)
  VALUES (p_wholesaler_id, 'pending', 0)
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::INTEGER;
    v_quantity := (v_item->>'quantity')::INTEGER;

    SELECT pr.wholesale_price INTO v_unit_price FROM product pr WHERE pr.id = v_product_id;
    v_subtotal := v_unit_price * v_quantity;

    INSERT INTO wholesaler_order_item (wholesaler_order_id, product_id, quantity, unit_price, subtotal)
    VALUES (v_order_id, v_product_id, v_quantity, v_unit_price, v_subtotal);

    v_total := v_total + v_subtotal;
  END LOOP;

  UPDATE wholesaler_order wo SET total_amount = v_total WHERE wo.id = v_order_id;

  RETURN QUERY SELECT v_order_id, v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_wholesaler_order(INTEGER, JSONB) TO service_role;

-- ---------------------------------------------------------------------------
-- Fulfillment
-- ---------------------------------------------------------------------------

-- p_items: [{"order_item_id": 5, "fulfill_quantity": 60}, ...] — staff-confirmed quantities,
-- capped at each item's ordered quantity. Items omitted from p_items are treated as 0 (not
-- fulfilled this pass). Only callable once, while the order is still 'pending' — there is no
-- "fulfill the remainder later" flow; if partially_fulfilled, that's the order's final state.
--
-- Reuses the exact same locked FEFO batch-consumption loop as create_sale
-- (004_sale_rpc.sql) and prepare_wholesale_order (007_orders.sql): lock candidate batches for
-- the product FOR UPDATE, sum availability, reject that item if short, then consume
-- earliest-expiry-first across batches, writing sale_item + stock_movement per batch touched.
-- Also creates a sale row (linked via wholesaler_order.sale_id, mirroring
-- wholesale_order.sale_id) so this reads through the same sale/sale_item mechanism every other
-- stock-out event in the app uses, rather than a second bookkeeping path.
CREATE OR REPLACE FUNCTION public.fulfill_wholesaler_order(
  p_order_id INTEGER,
  p_branch_id INTEGER,
  p_user_id INTEGER,
  p_items JSONB
) RETURNS TABLE (
  out_order_id INTEGER,
  out_sale_id INTEGER,
  out_status TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_status TEXT;
  v_receipt TEXT;
  v_sale_id INTEGER;
  v_sale_total NUMERIC := 0;
  v_item JSONB;
  v_order_item_id INTEGER;
  v_fulfill_qty INTEGER;
  v_ordered_qty INTEGER;
  v_unit_price NUMERIC;
  v_product_id INTEGER;
  v_available INTEGER;
  v_remaining INTEGER;
  v_take INTEGER;
  v_batch RECORD;
  v_any_fulfilled BOOLEAN := FALSE;
  v_all_full BOOLEAN;
  v_final_status TEXT;
BEGIN
  SELECT wo.status INTO v_current_status
  FROM wholesaler_order wo
  WHERE wo.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wholesaler order not found';
  END IF;

  IF v_current_status <> 'pending' THEN
    RAISE EXCEPTION 'Order is not pending (current status: %)', v_current_status;
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one item is required';
  END IF;

  v_receipt := 'WSR-' || extract(epoch from clock_timestamp())::bigint || '-' || p_user_id;

  INSERT INTO sale (branch_id, user_id, subtotal, total_amount, payment_method, receipt_number)
  VALUES (p_branch_id, p_user_id, 0, 0, 'cash', v_receipt)
  RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_order_item_id := (v_item->>'order_item_id')::INTEGER;
    v_fulfill_qty := (v_item->>'fulfill_quantity')::INTEGER;

    IF v_fulfill_qty IS NULL OR v_fulfill_qty < 0 THEN
      RAISE EXCEPTION 'fulfill_quantity must be a non-negative integer for order item %', v_order_item_id;
    END IF;

    SELECT woi.product_id, woi.quantity, woi.unit_price
    INTO v_product_id, v_ordered_qty, v_unit_price
    FROM wholesaler_order_item woi
    WHERE woi.id = v_order_item_id AND woi.wholesaler_order_id = p_order_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Order item % not found on this order', v_order_item_id;
    END IF;

    IF v_fulfill_qty > v_ordered_qty THEN
      RAISE EXCEPTION 'Cannot fulfill % of order item % — only % were ordered', v_fulfill_qty, v_order_item_id, v_ordered_qty;
    END IF;

    IF v_fulfill_qty = 0 THEN
      CONTINUE;
    END IF;

    WITH locked AS (
      SELECT b.quantity
      FROM batch b
      WHERE b.product_id = v_product_id AND b.branch_id = p_branch_id AND b.quantity > 0
      ORDER BY b.expiry_date ASC NULLS LAST
      FOR UPDATE
    )
    SELECT COALESCE(SUM(quantity), 0) INTO v_available FROM locked;

    IF v_available < v_fulfill_qty THEN
      RAISE EXCEPTION 'Insufficient stock for product % (confirmed %, have %)', v_product_id, v_fulfill_qty, v_available;
    END IF;

    v_remaining := v_fulfill_qty;

    FOR v_batch IN
      SELECT b.id, b.quantity
      FROM batch b
      WHERE b.product_id = v_product_id AND b.branch_id = p_branch_id AND b.quantity > 0
      ORDER BY b.expiry_date ASC NULLS LAST
    LOOP
      EXIT WHEN v_remaining <= 0;

      v_take := LEAST(v_batch.quantity, v_remaining);

      INSERT INTO sale_item (sale_id, batch_id, quantity, price_at_sale)
      VALUES (v_sale_id, v_batch.id, v_take, v_unit_price);

      UPDATE batch b SET quantity = b.quantity - v_take WHERE b.id = v_batch.id;

      INSERT INTO stock_movement (branch_id, batch_id, type, quantity, reason, user_id)
      VALUES (p_branch_id, v_batch.id, 'out', v_take, 'wholesaler_order', p_user_id);

      v_remaining := v_remaining - v_take;
    END LOOP;

    UPDATE wholesaler_order_item woi
    SET fulfilled_quantity = v_fulfill_qty
    WHERE woi.id = v_order_item_id;

    v_sale_total := v_sale_total + (v_unit_price * v_fulfill_qty);
    v_any_fulfilled := TRUE;
  END LOOP;

  IF NOT v_any_fulfilled THEN
    RAISE EXCEPTION 'At least one item must have a fulfill_quantity greater than zero';
  END IF;

  -- Computed fresh from the table rather than tracked in the loop, so items omitted from
  -- p_items entirely (implicitly 0) are correctly counted as not-fully-fulfilled too.
  SELECT NOT EXISTS (
    SELECT 1 FROM wholesaler_order_item woi
    WHERE woi.wholesaler_order_id = p_order_id AND woi.fulfilled_quantity < woi.quantity
  ) INTO v_all_full;

  v_final_status := CASE WHEN v_all_full THEN 'fulfilled' ELSE 'partially_fulfilled' END;

  UPDATE sale SET subtotal = v_sale_total, total_amount = v_sale_total WHERE id = v_sale_id;

  UPDATE wholesaler_order wo
  SET status = v_final_status, sale_id = v_sale_id, fulfilled_by = p_user_id, fulfilled_at = now()
  WHERE wo.id = p_order_id;

  RETURN QUERY SELECT p_order_id, v_sale_id, v_final_status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fulfill_wholesaler_order(INTEGER, INTEGER, INTEGER, JSONB) TO service_role;
