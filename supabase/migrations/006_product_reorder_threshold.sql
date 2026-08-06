-- Per-product low-stock threshold. A product is "low stock" when the sum of its batch
-- quantities (for a branch) falls at or below this value. Defaults to 10 but is editable
-- per product — different medicines need different reorder points.

ALTER TABLE product ADD COLUMN reorder_threshold INTEGER NOT NULL DEFAULT 10;
