-- Atomic sale creation: sale + one sale_item/stock_movement per batch consumed, in one
-- transaction. Replaces the app-level sequential inserts/compensating-deletes in
-- src/app/api/sales/route.ts, which could leave partial rows behind on a mid-sequence failure.
-- Consumes batches FEFO (earliest expiry first) and splits across multiple batches when no
-- single batch covers the full quantity. All candidate batches are locked with `FOR UPDATE`
-- up front, closing a race condition where two concurrent sales could both pass the stock
-- check and oversell the same stock.

CREATE OR REPLACE FUNCTION public.create_sale(
  p_branch_id INTEGER,
  p_user_id INTEGER,
  p_product_id INTEGER,
  p_quantity INTEGER
) RETURNS TABLE (
  sale_id INTEGER,
  subtotal NUMERIC,
  total_amount NUMERIC,
  receipt_number TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_sale_price NUMERIC;
  v_available INTEGER;
  v_remaining INTEGER;
  v_take INTEGER;
  v_subtotal NUMERIC;
  v_sale_id INTEGER;
  v_receipt TEXT;
  v_batch RECORD;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be a positive integer';
  END IF;

  SELECT sale_price INTO v_sale_price FROM product WHERE id = p_product_id;
  IF v_sale_price IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  -- Lock every candidate batch up front so a concurrent sale can't consume the same stock
  -- between our availability check and the consumption loop below.
  WITH locked AS (
    SELECT quantity
    FROM batch
    WHERE product_id = p_product_id AND branch_id = p_branch_id AND quantity > 0
    ORDER BY expiry_date ASC NULLS LAST
    FOR UPDATE
  )
  SELECT COALESCE(SUM(quantity), 0) INTO v_available FROM locked;

  IF v_available < p_quantity THEN
    RAISE EXCEPTION 'Insufficient stock for this product';
  END IF;

  v_subtotal := v_sale_price * p_quantity;
  v_receipt := 'RCPT-' || extract(epoch from clock_timestamp())::bigint || '-' || p_user_id;

  INSERT INTO sale (branch_id, user_id, subtotal, total_amount, payment_method, receipt_number)
  VALUES (p_branch_id, p_user_id, v_subtotal, v_subtotal, 'cash', v_receipt)
  RETURNING id INTO v_sale_id;

  v_remaining := p_quantity;

  FOR v_batch IN
    SELECT id, quantity
    FROM batch
    WHERE product_id = p_product_id AND branch_id = p_branch_id AND quantity > 0
    ORDER BY expiry_date ASC NULLS LAST
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_take := LEAST(v_batch.quantity, v_remaining);

    INSERT INTO sale_item (sale_id, batch_id, quantity, price_at_sale)
    VALUES (v_sale_id, v_batch.id, v_take, v_sale_price);

    UPDATE batch SET quantity = quantity - v_take WHERE id = v_batch.id;

    INSERT INTO stock_movement (branch_id, batch_id, type, quantity, reason, user_id)
    VALUES (p_branch_id, v_batch.id, 'out', v_take, 'sale', p_user_id);

    v_remaining := v_remaining - v_take;
  END LOOP;

  RETURN QUERY SELECT v_sale_id, v_subtotal, v_subtotal, v_receipt;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_sale(INTEGER, INTEGER, INTEGER, INTEGER) TO service_role;
