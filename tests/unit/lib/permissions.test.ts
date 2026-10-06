import { describe, expect, it } from "vitest";
import { hasPermission, requirePermission, type Permission } from "@/lib/permissions";

// The matrix is the single source of truth for who can do what, so pin it down explicitly:
// any change to it should be a deliberate edit to this table too.
const EXPECTED: Record<Permission, { owner: boolean; staff: boolean }> = {
  process_sale: { owner: true, staff: true },
  apply_discount: { owner: true, staff: true },
  approve_credit_sale: { owner: true, staff: false },
  log_incoming_stock: { owner: true, staff: true },
  stock_adjustment: { owner: true, staff: false },
  add_product: { owner: true, staff: true },
  edit_sale_price: { owner: true, staff: false },
  edit_wholesale_price: { owner: true, staff: false },
  view_reports: { owner: true, staff: false },
  log_product_request: { owner: true, staff: true },
};

describe("permission matrix", () => {
  it.each(Object.entries(EXPECTED))("%s", (permission, expected) => {
    expect(hasPermission("owner", permission as Permission)).toBe(expected.owner);
    expect(hasPermission("staff", permission as Permission)).toBe(expected.staff);
  });

  it("requirePermission throws only when the role lacks the permission", () => {
    expect(() => requirePermission("owner", "view_reports")).not.toThrow();
    expect(() => requirePermission("staff", "view_reports")).toThrow(/Forbidden.*staff.*view_reports/);
  });
});
