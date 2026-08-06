-- Wholesale price per product, separate from the existing retail price (product.sale_price,
-- left unrenamed — it's read/written by the create_sale and create_wholesale_order RPCs, the
-- Prisma schema, and several app routes/pages, and renaming it is out of scope for this pass).
-- Nullable: not every product is sold wholesale, and existing rows have no value until an
-- owner sets one.

ALTER TABLE product ADD COLUMN wholesale_price NUMERIC(10,2);
