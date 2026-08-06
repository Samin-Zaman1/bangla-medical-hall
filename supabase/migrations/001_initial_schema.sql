-- Pharmacy POS & Inventory — initial schema (from PROJECT_SPEC.md)
--
-- This is the real runtime schema (queried via the Supabase JS client, see
-- src/lib/supabase/server.ts). prisma/schema.prisma is a hand-maintained mirror used only to
-- generate TypeScript types — it is NOT applied at runtime. Any change here must also be made
-- there, or the generated types will drift from what this database actually returns.

CREATE TABLE branch (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT
);

CREATE TABLE app_user (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER REFERENCES branch(id),
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'staff')),
  pin_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE customer (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER REFERENCES branch(id),
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  credit_balance NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE supplier (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  contact_info TEXT,
  payment_terms TEXT
);

CREATE TABLE product (
  id SERIAL PRIMARY KEY,
  generic_name TEXT NOT NULL,
  brand_name TEXT,
  manufacturer TEXT,
  form TEXT,
  strength TEXT,
  is_controlled BOOLEAN DEFAULT false,
  sale_price NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE batch (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER REFERENCES branch(id),
  product_id INTEGER REFERENCES product(id),
  supplier_id INTEGER REFERENCES supplier(id),
  batch_number TEXT,
  expiry_date DATE,
  cost_price NUMERIC(10,2),
  quantity INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE purchase (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER REFERENCES branch(id),
  supplier_id INTEGER REFERENCES supplier(id),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_amount NUMERIC(12,2),
  payment_status TEXT CHECK (payment_status IN ('paid', 'due')),
  logged_by INTEGER REFERENCES app_user(id)
);

CREATE TABLE purchase_item (
  id SERIAL PRIMARY KEY,
  purchase_id INTEGER REFERENCES purchase(id),
  batch_id INTEGER REFERENCES batch(id),
  quantity INTEGER NOT NULL,
  cost_price NUMERIC(10,2)
);

CREATE TABLE sale (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER REFERENCES branch(id),
  user_id INTEGER REFERENCES app_user(id),
  customer_id INTEGER REFERENCES customer(id),
  timestamp TIMESTAMP DEFAULT now(),
  subtotal NUMERIC(12,2) NOT NULL,
  discount_amount NUMERIC(10,2) DEFAULT 0,
  discount_applied_by INTEGER REFERENCES app_user(id),
  total_amount NUMERIC(12,2) NOT NULL,
  payment_method TEXT CHECK (payment_method IN ('cash', 'bkash', 'nagad', 'credit')),
  receipt_number TEXT UNIQUE
);

CREATE TABLE sale_item (
  id SERIAL PRIMARY KEY,
  sale_id INTEGER REFERENCES sale(id),
  batch_id INTEGER REFERENCES batch(id),
  quantity INTEGER NOT NULL,
  price_at_sale NUMERIC(10,2) NOT NULL
);

CREATE TABLE credit_payment (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customer(id),
  amount NUMERIC(10,2) NOT NULL,
  date DATE DEFAULT CURRENT_DATE,
  user_id INTEGER REFERENCES app_user(id)
);

CREATE TABLE stock_movement (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER REFERENCES branch(id),
  batch_id INTEGER REFERENCES batch(id),
  type TEXT CHECK (type IN ('in', 'out', 'adjustment')),
  quantity INTEGER NOT NULL,
  reason TEXT,
  user_id INTEGER REFERENCES app_user(id),
  timestamp TIMESTAMP DEFAULT now()
);

CREATE TABLE controlled_substance_log (
  id SERIAL PRIMARY KEY,
  sale_id INTEGER REFERENCES sale(id),
  product_id INTEGER REFERENCES product(id),
  quantity INTEGER NOT NULL,
  timestamp TIMESTAMP DEFAULT now()
);

CREATE TABLE product_request (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER REFERENCES branch(id),
  product_name TEXT NOT NULL,
  requested_by_type TEXT CHECK (requested_by_type IN ('customer', 'staff')),
  requested_by_customer_id INTEGER REFERENCES customer(id),
  requested_by_user_id INTEGER REFERENCES app_user(id),
  quantity_needed INTEGER,
  status TEXT CHECK (status IN ('pending', 'fulfilled', 'rejected')) DEFAULT 'pending',
  notes TEXT,
  timestamp TIMESTAMP DEFAULT now()
);

-- Search indexes for product lookup (no barcode — name search only)
CREATE INDEX idx_product_generic_name ON product (generic_name);
CREATE INDEX idx_product_brand_name ON product (brand_name);
CREATE INDEX idx_customer_name ON customer (name);
CREATE INDEX idx_customer_phone ON customer (phone);
