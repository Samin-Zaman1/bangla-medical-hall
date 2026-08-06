-- Retail credit sales ("baki") — makes customer.credit_balance, the credit_payment table, and
-- the 'credit' payment_method value (all present since 001_initial_schema.sql) actually do
-- something. Until now nothing ever wrote to credit_balance and create_sale had no way to
-- attribute a sale to a customer or choose a payment method at all — it hardcoded
-- payment_method='cash' and left customer_id NULL on every insert.

-- create_sale's argument list is changing (two new trailing params), which Postgres treats as a
-- distinct overload rather than a replacement — drop the old 4-arg version explicitly so it
-- doesn't linger as dead code alongside the new one.
DROP FUNCTION IF EXISTS public.create_sale(INTEGER, INTEGER, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION public.create_sale(
  p_branch_id INTEGER,
  p_user_id INTEGER,
  p_product_id INTEGER,
  p_quantity INTEGER,
  p_customer_id INTEGER DEFAULT NULL,
  p_payment_method TEXT DEFAULT 'cash'
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

  IF p_payment_method NOT IN ('cash', 'bkash', 'nagad', 'credit') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;

  IF p_payment_method = 'credit' AND p_customer_id IS NULL THEN
    RAISE EXCEPTION 'A customer is required for a credit sale';
  END IF;

  -- Locks the customer row (when one is attached) for the rest of this transaction, so the
  -- credit_balance increment below can't race a concurrent sale or payment against the same
  -- customer. Also doubles as the existence check.
  IF p_customer_id IS NOT NULL THEN
    PERFORM 1 FROM customer WHERE id = p_customer_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Customer not found';
    END IF;
  END IF;

  SELECT sale_price INTO v_sale_price FROM product WHERE id = p_product_id;
  IF v_sale_price IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

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

  INSERT INTO sale (branch_id, user_id, customer_id, subtotal, total_amount, payment_method, receipt_number)
  VALUES (p_branch_id, p_user_id, p_customer_id, v_subtotal, v_subtotal, p_payment_method, v_receipt)
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

  IF p_payment_method = 'credit' THEN
    UPDATE customer SET credit_balance = credit_balance + v_subtotal WHERE id = p_customer_id;
  END IF;

  RETURN QUERY SELECT v_sale_id, v_subtotal, v_subtotal, v_receipt;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_sale(INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- Repaying credit (the credit_payment table existed but nothing ever wrote to it — this is
-- the write path the stubbed src/app/api/credit-payments/route.ts POST will call)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_credit_payment(
  p_customer_id INTEGER,
  p_amount NUMERIC,
  p_user_id INTEGER
) RETURNS TABLE (
  out_customer_id INTEGER,
  out_credit_balance NUMERIC
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_balance NUMERIC;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive';
  END IF;

  SELECT credit_balance INTO v_balance FROM customer WHERE id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;

  IF p_amount > v_balance THEN
    RAISE EXCEPTION 'Payment (%) exceeds outstanding credit balance (%)', p_amount, v_balance;
  END IF;

  UPDATE customer SET credit_balance = credit_balance - p_amount WHERE id = p_customer_id;

  INSERT INTO credit_payment (customer_id, amount, user_id)
  VALUES (p_customer_id, p_amount, p_user_id);

  RETURN QUERY SELECT p_customer_id, v_balance - p_amount;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_credit_payment(INTEGER, NUMERIC, INTEGER) TO service_role;

-- ---------------------------------------------------------------------------
-- Staff bulk-sale credit: wholesale_order's "pay" action (src/app/api/wholesale-orders/[id]/
-- route.ts) previously did a plain `.update({status:'paid', payment_method, paid_at})` — picking
-- 'credit' there was a cosmetic label with no effect on customer.credit_balance. This RPC gives
-- it the same real effect as a retail credit sale.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_wholesale_order_paid(
  p_order_id INTEGER,
  p_branch_id INTEGER,
  p_payment_method TEXT
) RETURNS TABLE (
  out_order_id INTEGER,
  out_status TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_status TEXT;
  v_customer_id INTEGER;
  v_total NUMERIC;
BEGIN
  IF p_payment_method NOT IN ('cash', 'bkash', 'nagad', 'credit') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;

  SELECT wo.status, wo.customer_id, wo.total_amount INTO v_current_status, v_customer_id, v_total
  FROM wholesale_order wo
  WHERE wo.id = p_order_id AND wo.branch_id = p_branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wholesale order not found';
  END IF;

  IF v_current_status <> 'prepared' THEN
    RAISE EXCEPTION 'Order must be prepared before it can be paid (current status: %)', v_current_status;
  END IF;

  IF p_payment_method = 'credit' THEN
    IF v_customer_id IS NULL THEN
      RAISE EXCEPTION 'Cannot pay by credit — this order has no customer attached';
    END IF;

    PERFORM 1 FROM customer WHERE id = v_customer_id FOR UPDATE;
    UPDATE customer SET credit_balance = credit_balance + v_total WHERE id = v_customer_id;
  END IF;

  UPDATE wholesale_order wo
  SET status = 'paid', payment_method = p_payment_method, paid_at = now()
  WHERE wo.id = p_order_id;

  RETURN QUERY SELECT p_order_id, 'paid'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_wholesale_order_paid(INTEGER, INTEGER, TEXT) TO service_role;
