-- Wholesaler self-service accounts, separate from app_user (staff/owner). No approval/status
-- field: accounts are active immediately on signup. email is the login identifier, hence
-- NOT NULL UNIQUE.

CREATE TABLE wholesaler (
  id SERIAL PRIMARY KEY,
  shop_name TEXT NOT NULL,
  phone TEXT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_wholesaler_email ON wholesaler (email);
