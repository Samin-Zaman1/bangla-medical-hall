/**
 * Regenerates the README screenshots in docs/images/ from a realistic demo dataset.
 *
 *   npm run db:local:start
 *   npm run screenshots        # starts nothing itself — expects the app on :3100 (npm run test:e2e does this, or:)
 *                              # NEXT_PUBLIC_SUPABASE_URL=… npx next dev --port 3100
 *
 * Wipes the LOCAL database (same safety guard as the E2E suite: it refuses non-local URLs).
 */
import { chromium, type Page } from "@playwright/test";
import { connect, resetAndSeed } from "../tests/e2e/support/db";
import { E2E } from "../tests/e2e/support/env";
import { LOCKOUT_TESTER, OWNER, PIN_TESTER, pickerLabel } from "../tests/e2e/support/seed";
import { hashPassword } from "../src/lib/auth/password";

const OUT = "docs/images";

// generic, brand, form, strength, retail, wholesale, stock, expiry, controlled
const PRODUCTS: [string, string, string, string, number, number | null, number, string, boolean?][] = [
  ["Paracetamol", "Napa", "Tablet", "500mg", 1.2, 0.95, 480, "2027-09-30"],
  ["Paracetamol + Caffeine", "Napa Extra", "Tablet", "500mg/65mg", 2.5, 2.0, 320, "2027-06-30"],
  ["Omeprazole", "Seclo", "Capsule", "20mg", 6, 4.8, 210, "2027-03-31"],
  ["Esomeprazole", "Maxpro", "Tablet", "20mg", 7, 5.6, 150, "2027-05-31"],
  ["Fexofenadine", "Fexo", "Tablet", "120mg", 9, 7.2, 96, "2026-12-31"],
  ["Cetirizine", "Alatrol", "Tablet", "10mg", 3, 2.4, 260, "2027-08-31"],
  ["Montelukast", "Monas", "Tablet", "10mg", 16, 12.8, 8, "2027-01-31"],
  ["Azithromycin", "Zimax", "Tablet", "500mg", 35, 28, 60, "2026-11-30"],
  ["Metformin", "Comet", "Tablet", "500mg", 4, 3.2, 300, "2027-10-31"],
  ["Oral Rehydration Salts", "ORSaline-N", "Sachet", "20.5g", 6, 4.5, 400, "2028-02-29"],
  ["Diazepam", "Sedil", "Tablet", "5mg", 2, null, 40, "2027-04-30", true],
  ["Amoxicillin", "Moxacil", "Capsule", "500mg", 8, 6.4, 0, "2027-02-28"],
];

async function seedDemo() {
  const sql = connect();
  await resetAndSeed(sql);
  await sql`DELETE FROM app_user WHERE name IN (${PIN_TESTER.name}, ${LOCKOUT_TESTER.name})`;
  const [{ id: branchId }] = await sql<{ id: number }[]>`
    UPDATE branch SET name = 'Bangla Medical Hall — Dhanmondi' RETURNING id`;

  for (const [generic, brand, form, strength, price, wholesale, stock, expiry, controlled] of PRODUCTS) {
    const [p] = await sql<{ id: number }[]>`
      INSERT INTO product (generic_name, brand_name, form, strength, sale_price, wholesale_price, is_controlled, manufacturer)
      VALUES (${generic}, ${brand}, ${form}, ${strength}, ${price}, ${wholesale}, ${controlled ?? false}, 'Square Pharmaceuticals')
      RETURNING id`;
    if (stock > 0) {
      await sql`INSERT INTO batch (branch_id, product_id, quantity, expiry_date, cost_price, batch_number)
                VALUES (${branchId}, ${p.id}, ${stock}, ${expiry}, ${Math.round(price * 70) / 100}, ${`B-${2400 + p.id}`})`;
    }
  }
  // One batch close to expiry, so the "expiring soon" tile has something to show.
  await sql`UPDATE batch SET expiry_date = CURRENT_DATE + 20
            WHERE product_id = (SELECT id FROM product WHERE brand_name = 'Zimax')`;

  for (const [name, phone, credit] of [
    ["Rahima Begum", "01711-234567", 840],
    ["Abdul Karim", "01819-876543", 0],
    ["Nasrin Akter", "01552-112233", 215.5],
  ] as const) {
    await sql`INSERT INTO customer (branch_id, name, phone, credit_balance) VALUES (${branchId}, ${name}, ${phone}, ${credit})`;
  }
  await sql`INSERT INTO wholesaler (shop_name, phone, email, password_hash)
            VALUES ('Rahman Pharmacy', '01911-445566', 'demo@rahmanpharmacy.com', ${await hashPassword("demo-password")})`;
  await sql.end();
}

async function addToBill(page: Page, search: string, name: RegExp) {
  await page.getByRole("textbox", { name: "Search products" }).fill(search);
  await page.getByRole("button", { name }).click();
}

async function main() {
  await seedDemo();
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: E2E.baseURL, viewport: { width: 1440, height: 900 }, colorScheme: "light" });
  // Hide the Next.js dev-mode badge so screenshots look like production.
  const hideDevBadge = () =>
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = "nextjs-portal { display: none !important; }";
      document.head.append(style);
    });
  await context.addInitScript(hideDevBadge);
  const page = await context.newPage();
  const shot = (name: string) => page.screenshot({ path: `${OUT}/${name}.png` });

  // 1. Login
  await page.goto("/login");
  await page.getByLabel("User").selectOption({ label: pickerLabel(OWNER) });
  await page.getByLabel("PIN").fill(OWNER.pin);
  await shot("login");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/sales$/);

  // 2. Point of sale with a bill in progress
  await addToBill(page, "napa 500", /^Paracetamol Napa/);
  await page.getByRole("spinbutton", { name: "Quantity of Paracetamol" }).fill("10");
  await addToBill(page, "seclo", /^Omeprazole/);
  await page.getByRole("spinbutton", { name: "Quantity of Omeprazole" }).fill("14");
  await addToBill(page, "fexo", /^Fexofenadine/);
  await page.getByRole("spinbutton", { name: "Quantity of Fexofenadine" }).fill("5");
  await page.getByLabel("Discount (৳)").fill("10");
  await page.getByLabel("Cash received (৳)").fill("200");
  await page.getByRole("textbox", { name: "Search products" }).fill("");
  await shot("point-of-sale");

  // 3. Receipt
  await page.getByRole("button", { name: /Complete sale/ }).click();
  await page.getByRole("link", { name: /View \/ print receipt/ }).click();
  await page.waitForURL(/\/sales\/history\/\d+$/);
  await page.getByRole("table").waitFor();
  await shot("receipt");

  // 4. Inventory
  await page.goto("/inventory");
  await page.getByRole("table").waitFor();
  await shot("inventory");

  // 5. Wholesaler catalogue with a cart
  const wholesalerContext = await browser.newContext({ baseURL: E2E.baseURL, viewport: { width: 1440, height: 900 }, colorScheme: "light" });
  await wholesalerContext.addInitScript(hideDevBadge);
  const wholesaler = await wholesalerContext.newPage();
  await wholesaler.goto("/wholesaler/login");
  await wholesaler.getByLabel("Email").fill("demo@rahmanpharmacy.com");
  await wholesaler.getByLabel("Password", { exact: true }).fill("demo-password");
  await wholesaler.getByRole("button", { name: "Sign in" }).click();
  await wholesaler.waitForURL(/\/wholesaler\/catalog$/);
  await wholesaler.getByRole("spinbutton", { name: "Quantity of Paracetamol", exact: true }).fill("100");
  await wholesaler.getByRole("spinbutton", { name: "Quantity of Cetirizine" }).fill("50");
  await wholesaler.getByRole("spinbutton", { name: "Quantity of Oral Rehydration Salts" }).fill("80");
  await wholesaler.screenshot({ path: `${OUT}/wholesaler-catalog.png` });

  await browser.close();
  console.log(`Screenshots written to ${OUT}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
