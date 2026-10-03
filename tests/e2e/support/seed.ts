/** Baseline accounts created by global-setup. Tests create their own products/customers. */

export type SeedUser = { name: string; role: "owner" | "staff"; pin: string };

export const BRANCH_NAME = "E2E Pharmacy";

export const OWNER: SeedUser = { name: "Ayesha Owner", role: "owner", pin: "1111" };
export const STAFF: SeedUser = { name: "Rafi Staff", role: "staff", pin: "2222" };
// Dedicated accounts for failed-login tests, so their lockout state can't affect anyone else.
export const PIN_TESTER: SeedUser = { name: "Pin Tester", role: "staff", pin: "3333" };
export const LOCKOUT_TESTER: SeedUser = { name: "Lockout Tester", role: "staff", pin: "4444" };

export const SEED_USERS = [OWNER, STAFF, PIN_TESTER, LOCKOUT_TESTER];

export const OWNER_STATE = "test-results/.auth/owner.json";
export const STAFF_STATE = "test-results/.auth/staff.json";

/** Label of a user in the login picker. */
export const pickerLabel = (user: SeedUser) => `${user.name} (${user.role})`;
