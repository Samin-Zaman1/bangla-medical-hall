-- Confirms a draft purchase_invoice and increments stock. Same increment mechanism as
-- create_batch (005_batch_rpc.sql) and mark_purchase_delivered (007_orders.sql) — insert one
-- new batch per incoming line item, plus a matching stock_movement('in') row. Not a new
-- stock-mutation pathway; mark_purchase_delivered is the direct precedent (same shape, applied
-- to the *other* purchase table's order-confirmation step).
--
-- Blocks confirmation while any item has product_id IS NULL, naming every unresolved item by
-- its raw_extracted_name so staff know exactly which rows still need a match — draft purchases
-- must have zero stock effect until every line is resolved and this RPC actually runs.

CREATE OR REPLACE FUNCTION public.confirm_purchase_invoice(
  p_purchase_invoice_id INTEGER,
  p_branch_id INTEGER,
  p_user_id INTEGER
) RETURNS TABLE (
  out_purchase_invoice_id INTEGER,
  out_status TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_status TEXT;
  v_unresolved_names TEXT;
  v_item RECORD;
  v_batch_id INTEGER;
BEGIN
  SELECT pi.status INTO v_current_status
  FROM purchase_invoice pi
  WHERE pi.id = p_purchase_invoice_id AND pi.branch_id = p_branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase invoice not found';
  END IF;

  IF v_current_status <> 'draft' THEN
    RAISE EXCEPTION 'Purchase invoice is not a draft (current status: %)', v_current_status;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM purchase_invoice_item pii WHERE pii.purchase_invoice_id = p_purchase_invoice_id
  ) THEN
    RAISE EXCEPTION 'Purchase invoice has no line items';
  END IF;

  SELECT string_agg(pii.raw_extracted_name, ', ') INTO v_unresolved_names
  FROM purchase_invoice_item pii
  WHERE pii.purchase_invoice_id = p_purchase_invoice_id AND pii.product_id IS NULL;

  IF v_unresolved_names IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot confirm: these items still need a matched product: %', v_unresolved_names;
  END IF;

  FOR v_item IN
    SELECT pii.id, pii.product_id, pii.quantity, pii.unit_cost
    FROM purchase_invoice_item pii
    WHERE pii.purchase_invoice_id = p_purchase_invoice_id
  LOOP
    IF v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
      RAISE EXCEPTION 'Item % has an invalid quantity', v_item.id;
    END IF;

    INSERT INTO batch (branch_id, product_id, batch_number, expiry_date, cost_price, quantity)
    VALUES (p_branch_id, v_item.product_id, NULL, NULL, v_item.unit_cost, v_item.quantity)
    RETURNING id INTO v_batch_id;

    INSERT INTO stock_movement (branch_id, batch_id, type, quantity, reason, user_id)
    VALUES (p_branch_id, v_batch_id, 'in', v_item.quantity, 'purchase_invoice_confirmed', p_user_id);
  END LOOP;

  UPDATE purchase_invoice pi SET status = 'confirmed' WHERE pi.id = p_purchase_invoice_id;

  RETURN QUERY SELECT p_purchase_invoice_id, 'confirmed'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_purchase_invoice(INTEGER, INTEGER, INTEGER) TO service_role;
