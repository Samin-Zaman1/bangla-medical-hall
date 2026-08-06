import type { UserRole } from "@prisma/client";

export type Permission =
  | "process_sale"
  | "apply_discount"
  | "approve_credit_sale"
  | "log_incoming_stock"
  | "stock_adjustment"
  | "add_product"
  | "edit_sale_price"
  | "edit_wholesale_price"
  | "view_reports"
  | "log_product_request";

const PERMISSION_MATRIX: Record<UserRole, Permission[]> = {
  owner: [
    "process_sale",
    "apply_discount",
    "approve_credit_sale",
    "log_incoming_stock",
    "stock_adjustment",
    "add_product",
    "edit_sale_price",
    "edit_wholesale_price",
    "view_reports",
    "log_product_request",
  ],
  staff: [
    "process_sale",
    "apply_discount",
    "log_incoming_stock",
    "add_product",
    "log_product_request",
  ],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return PERMISSION_MATRIX[role].includes(permission);
}

export function requirePermission(
  role: UserRole,
  permission: Permission,
): void {
  if (!hasPermission(role, permission)) {
    throw new Error(`Forbidden: role "${role}" lacks permission "${permission}"`);
  }
}
