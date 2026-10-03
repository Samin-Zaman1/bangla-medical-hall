-- Multi-item point-of-sale.
--
-- create_sale (013_credit_baki.sql) only ever sold ONE product per sale, so a customer buying
-- three medicines produced three separate sales and three receipts. This replaces it with a
-- version that takes the whole bill as a JSONB array of {product_id, quantity} and records it
-- as one sale / one receipt, in one transaction: if any line can't be covered by stock, the
-- whole bill rolls back and nothing is decremented.
--
-- Also adds:
--   * an optional flat discount (sale.discount_amount / discount_applied_by already existed but
--     nothing wrote to them),
--   * controlled_substance_log rows for controlled products (table existed, never written),
--   * millisecond receipt numbers — the old per-second ones collided (receipt_number is UNIQUE)
--     when the same user rang up two sales within one second.
--
-- Unit prices always come from product.sale_price here, never from the client.

DROP FUNCTION IF EXISTS public.create_sale(INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, TEXT);

CREATE OR REPLACE FUNCTION public.create_sale(
  p_branch_id INTEGER,
  p_user_id INTEGER,
  p_items JSONB,
  p_customer_id INTEGER DEFAULT NULL,
  p_payment_method TEXT DEFAULT 'cash',
  p_discount_amount NUMERIC DEFAULT 0
) RETURNS TABLE (
  sale_id INTEGER,
  subtotal NUMERIC,
  total_amount NUMERIC,
  receipt_number TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_item RECORD;
  v_product RECORD;
  v_available INTEGER;
  v_remaining INTEGER;
  v_take INTEGER;
  v_batch RECORD;
  v_subtotal NUMERIC := 0;
  v_discount NUMERIC := COALESCE(p_discount_amount, 0);
  v_total NUMERIC;
  v_sale_id INTEGER;
  v_receipt TEXT;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'A sale needs at least one item';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) e
    WHERE (e->>'product_id') IS NULL
       OR (e->>'quantity') IS NULL
       OR (e->>'quantity')::INTEGER <= 0
  ) THEN
    RAISE EXCEPTION 'Quantity must be a positive integer';
  END IF;

  IF p_payment_method NOT IN ('cash', 'bkash', 'nagad', 'credit') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;

  IF p_payment_method = 'credit' AND p_customer_id IS NULL THEN
    RAISE EXCEPTION 'A customer is required for a credit sale';
  END IF;

  IF v_discount < 0 THEN
    RAISE EXCEPTION 'Discount cannot be negative';
  END IF;

  -- Locks the customer row for the rest of the transaction so the credit_balance increment
  -- below can't race a concurrent sale or payment. Also doubles as the existence check.
  IF p_customer_id IS NOT NULL THEN
    PERFORM 1 FROM customer c WHERE c.id = p_customer_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Customer not found';
    END IF;
  END IF;

  v_receipt := 'RCPT-' || (extract(epoch from clock_timestamp()) * 1000)::BIGINT || '-' || p_user_id;

  -- Totals are filled in after the lines are consumed (same approach as create_wholesale_order).
  INSERT INTO sale (branch_id, user_id, customer_id, subtotal, total_amount, payment_method, receipt_number)
  VALUES (p_branch_id, p_user_id, p_customer_id, 0, 0, p_payment_method, v_receipt)
  RETURNING id INTO v_sale_id;

  -- The same product listed twice is merged into one line; ordering by product_id keeps lock
  -- acquisition order stable across concurrent sales.
  FOR v_item IN
    SELECT (e->>'product_id')::INTEGER AS product_id, SUM((e->>'quantity')::INTEGER)::INTEGER AS quantity
    FROM jsonb_array_elements(p_items) e
    GROUP BY 1
    ORDER BY 1
  LOOP
    SELECT pr.generic_name, pr.sale_price, pr.is_controlled INTO v_product
    FROM product pr
    WHERE pr.id = v_item.product_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product not found (id %)', v_item.product_id;
    END IF;

    WITH locked AS (
      SELECT b.quantity
      FROM batch b
      WHERE b.product_id = v_item.product_id AND b.branch_id = p_branch_id AND b.quantity > 0
      ORDER BY b.expiry_date ASC NULLS LAST
      FOR UPDATE
    )
    SELECT COALESCE(SUM(quantity), 0) INTO v_available FROM locked;

    IF v_available < v_item.quantity THEN
      RAISE EXCEPTION 'Insufficient stock for % (need %, have %)', v_product.generic_name, v_item.quantity, v_available;
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
      VALUES (v_sale_id, v_batch.id, v_take, v_product.sale_price);

      UPDATE batch b SET quantity = b.quantity - v_take WHERE b.id = v_batch.id;

      INSERT INTO stock_movement (branch_id, batch_id, type, quantity, reason, user_id)
      VALUES (p_branch_id, v_batch.id, 'out', v_take, 'sale', p_user_id);

      v_remaining := v_remaining - v_take;
    END LOOP;

    IF v_product.is_controlled THEN
      INSERT INTO controlled_substance_log (sale_id, product_id, quantity)
      VALUES (v_sale_id, v_item.product_id, v_item.quantity);
    END IF;

    v_subtotal := v_subtotal + v_product.sale_price * v_item.quantity;
  END LOOP;

  IF v_discount > v_subtotal THEN
    RAISE EXCEPTION 'Discount cannot exceed the subtotal';
  END IF;

  v_total := v_subtotal - v_discount;

  UPDATE sale s
  SET subtotal = v_subtotal,
      discount_amount = v_discount,
      discount_applied_by = CASE WHEN v_discount > 0 THEN p_user_id ELSE NULL END,
      total_amount = v_total
  WHERE s.id = v_sale_id;

  IF p_payment_method = 'credit' THEN
    UPDATE customer c SET credit_balance = c.credit_balance + v_total WHERE c.id = p_customer_id;
  END IF;

  RETURN QUERY SELECT v_sale_id, v_subtotal, v_total, v_receipt;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_sale(INTEGER, INTEGER, JSONB, INTEGER, TEXT, NUMERIC) TO service_role;

-- Make PostgREST (supabase.rpc) pick up the new signature immediately.
NOTIFY pgrst, 'reload schema';
