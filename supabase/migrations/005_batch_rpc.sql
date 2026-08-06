-- Phase 2: batch create + adjustment, each atomic (batch write + stock_movement in one
-- transaction) and following the same pattern as create_sale in 004_sale_rpc.sql.
-- adjust_batch_quantity locks the batch row with FOR UPDATE so concurrent adjustments/sales
-- against the same batch can't race each other into a negative or inconsistent quantity.

CREATE OR REPLACE FUNCTION public.create_batch(
  p_branch_id INTEGER,
  p_product_id INTEGER,
  p_quantity INTEGER,
  p_batch_number TEXT,
  p_expiry_date DATE,
  p_cost_price NUMERIC,
  p_supplier_id INTEGER,
  p_user_id INTEGER
) RETURNS TABLE (
  batch_id INTEGER,
  quantity INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_batch_id INTEGER;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be a positive integer';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM product WHERE id = p_product_id) THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  INSERT INTO batch (branch_id, product_id, supplier_id, batch_number, expiry_date, cost_price, quantity)
  VALUES (p_branch_id, p_product_id, p_supplier_id, p_batch_number, p_expiry_date, p_cost_price, p_quantity)
  RETURNING id INTO v_batch_id;

  INSERT INTO stock_movement (branch_id, batch_id, type, quantity, reason, user_id)
  VALUES (p_branch_id, v_batch_id, 'in', p_quantity, 'batch_created', p_user_id);

  RETURN QUERY SELECT v_batch_id, p_quantity;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_batch(
  INTEGER, INTEGER, INTEGER, TEXT, DATE, NUMERIC, INTEGER, INTEGER
) TO service_role;

CREATE OR REPLACE FUNCTION public.adjust_batch_quantity(
  p_batch_id INTEGER,
  p_branch_id INTEGER,
  p_quantity_delta INTEGER,
  p_reason TEXT,
  p_user_id INTEGER
) RETURNS TABLE (
  batch_id INTEGER,
  quantity INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_quantity INTEGER;
BEGIN
  IF p_quantity_delta IS NULL OR p_quantity_delta = 0 THEN
    RAISE EXCEPTION 'quantityDelta must be a non-zero integer';
  END IF;

  SELECT batch.quantity INTO v_quantity
  FROM batch
  WHERE id = p_batch_id AND branch_id = p_branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch not found';
  END IF;

  IF v_quantity + p_quantity_delta < 0 THEN
    RAISE EXCEPTION 'Adjustment would result in negative stock';
  END IF;

  -- Use v_quantity (read above under FOR UPDATE) rather than re-reading the bare "quantity"
  -- column here — RETURNS TABLE(quantity INTEGER) creates an implicit OUT variable named
  -- "quantity" that shadows the column and makes a direct "quantity + ..." reference ambiguous.
  UPDATE batch SET quantity = v_quantity + p_quantity_delta WHERE id = p_batch_id;

  INSERT INTO stock_movement (branch_id, batch_id, type, quantity, reason, user_id)
  VALUES (p_branch_id, p_batch_id, 'adjustment', p_quantity_delta, p_reason, p_user_id);

  RETURN QUERY SELECT p_batch_id, v_quantity + p_quantity_delta;
END;
$$;

GRANT EXECUTE ON FUNCTION public.adjust_batch_quantity(
  INTEGER, INTEGER, INTEGER, TEXT, INTEGER
) TO service_role;
