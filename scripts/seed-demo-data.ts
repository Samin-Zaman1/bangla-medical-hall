import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const ws = require("ws");
(globalThis as typeof globalThis & { WebSocket: typeof ws.WebSocket }).WebSocket = ws.WebSocket;

function loadEnvFile(fileName: string) {
  const fullPath = path.resolve(process.cwd(), fileName);
  if (!fs.existsSync(fullPath)) return;

  const contents = fs.readFileSync(fullPath, "utf8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (!key || process.env[key] !== undefined) continue;

    process.env[key] = value.replace(/^['"]|['"]$/g, "");
  }
}

loadEnvFile(".env");
loadEnvFile(".env.local");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type ProductSeed = {
  generic_name: string;
  brand_name: string;
  manufacturer: string;
  form: string;
  strength: string;
  is_controlled: boolean;
  sale_price: number;
};

const products: ProductSeed[] = [
  { generic_name: "Paracetamol 500mg", brand_name: "Napa", manufacturer: "Beximco Pharmaceuticals", form: "Tablet", strength: "500mg", is_controlled: false, sale_price: 1.5 },
  { generic_name: "Amoxicillin 250mg", brand_name: "Amodis", manufacturer: "Square Pharmaceuticals", form: "Capsule", strength: "250mg", is_controlled: false, sale_price: 4.0 },
  { generic_name: "Vitamin C 1000mg", brand_name: "Cevit", manufacturer: "ACI Limited", form: "Tablet", strength: "1000mg", is_controlled: false, sale_price: 3.25 },
  { generic_name: "Omeprazole 20mg", brand_name: "Seclo", manufacturer: "Square Pharmaceuticals", form: "Capsule", strength: "20mg", is_controlled: false, sale_price: 5.0 },
  { generic_name: "Metformin 500mg", brand_name: "Comet", manufacturer: "Incepta Pharmaceuticals", form: "Tablet", strength: "500mg", is_controlled: false, sale_price: 2.0 },
  { generic_name: "Losartan 50mg", brand_name: "Lozap", manufacturer: "Beximco Pharmaceuticals", form: "Tablet", strength: "50mg", is_controlled: false, sale_price: 6.0 },
  { generic_name: "Cetirizine 10mg", brand_name: "Alatrol", manufacturer: "Square Pharmaceuticals", form: "Tablet", strength: "10mg", is_controlled: false, sale_price: 1.0 },
  { generic_name: "Azithromycin 500mg", brand_name: "Azithrocin", manufacturer: "Beximco Pharmaceuticals", form: "Tablet", strength: "500mg", is_controlled: false, sale_price: 12.0 },
  { generic_name: "Diazepam 5mg", brand_name: "Sedil", manufacturer: "Square Pharmaceuticals", form: "Tablet", strength: "5mg", is_controlled: true, sale_price: 1.5 },
  { generic_name: "Tramadol 50mg", brand_name: "Tramal", manufacturer: "ACI Limited", form: "Capsule", strength: "50mg", is_controlled: true, sale_price: 3.0 },
  { generic_name: "Salbutamol Inhaler", brand_name: "Ventolin", manufacturer: "GlaxoSmithKline Bangladesh", form: "Inhaler", strength: "100mcg", is_controlled: false, sale_price: 180.0 },
  { generic_name: "Oral Rehydration Salt", brand_name: "ORSaline-N", manufacturer: "ACME Laboratories", form: "Sachet", strength: "20.5g", is_controlled: false, sale_price: 8.0 },
  { generic_name: "Ciprofloxacin 500mg", brand_name: "Ciprocin", manufacturer: "Square Pharmaceuticals", form: "Tablet", strength: "500mg", is_controlled: false, sale_price: 5.5 },
  { generic_name: "Multivitamin Syrup", brand_name: "Pediakid", manufacturer: "Renata Limited", form: "Syrup", strength: "100ml", is_controlled: false, sale_price: 65.0 },
];

const suppliers = [
  { name: "Square Pharmaceuticals Distribution", contact_info: "01711-000111", payment_terms: "Net 15 days" },
  { name: "Beximco Pharma Wholesale", contact_info: "01911-000222", payment_terms: "Net 30 days" },
];

const customers = [
  { name: "Rahim Uddin", phone: "01611-223344", address: "Mirpur, Dhaka", credit_balance: 0 },
  { name: "Karim Traders", phone: "01711-556677", address: "New Market, Dhaka", credit_balance: 850.0 },
  { name: "Fatema Begum", phone: "01811-889900", address: "Dhanmondi, Dhaka", credit_balance: 0 },
];

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const { data: branch, error: branchError } = await supabase.from("branch").select("id, name").limit(1).maybeSingle();
  if (branchError) throw new Error(`Failed to read branch: ${branchError.message}`);
  if (!branch) throw new Error("No branch found — run the app's /setup flow first to create the owner account and branch.");
  console.log(`Using branch: ${branch.name} (id=${branch.id})`);

  const supplierIds: number[] = [];
  for (const supplier of suppliers) {
    const { data: existing } = await supabase.from("supplier").select("id").eq("name", supplier.name).maybeSingle();
    if (existing) {
      supplierIds.push(existing.id);
      continue;
    }
    const { data: created, error } = await supabase.from("supplier").insert(supplier).select("id").single();
    if (error) throw new Error(`Failed to insert supplier ${supplier.name}: ${error.message}`);
    supplierIds.push(created.id);
  }
  console.log(`Suppliers ready: ${supplierIds.length}`);

  const productIds: number[] = [];
  for (const product of products) {
    const { data: existing } = await supabase.from("product").select("id").eq("generic_name", product.generic_name).maybeSingle();
    if (existing) {
      const { error } = await supabase
        .from("product")
        .update({
          brand_name: product.brand_name,
          manufacturer: product.manufacturer,
          form: product.form,
          strength: product.strength,
          is_controlled: product.is_controlled,
        })
        .eq("id", existing.id);
      if (error) throw new Error(`Failed to update product ${product.generic_name}: ${error.message}`);
      productIds.push(existing.id);
      continue;
    }
    const { data: created, error } = await supabase.from("product").insert(product).select("id").single();
    if (error) throw new Error(`Failed to insert product ${product.generic_name}: ${error.message}`);
    productIds.push(created.id);
  }
  console.log(`Products ready: ${productIds.length}`);

  const { count: existingBatchCount } = await supabase.from("batch").select("*", { count: "exact", head: true });
  if (existingBatchCount && existingBatchCount > 0) {
    console.log(`Skipping batch seeding — ${existingBatchCount} batch row(s) already exist.`);
  } else {
    const batches = productIds.map((productId, i) => {
      const product = products[i];
      const nearExpiry = i % 7 === 0;
      return {
        branch_id: branch.id,
        product_id: productId,
        supplier_id: supplierIds[i % supplierIds.length],
        batch_number: `BN-2026-${String(i + 1).padStart(3, "0")}`,
        expiry_date: nearExpiry ? addDays(45) : addDays(540),
        cost_price: Math.round(product.sale_price * 0.65 * 100) / 100,
        quantity: 20 + ((i * 13) % 130),
      };
    });
    const { error } = await supabase.from("batch").insert(batches);
    if (error) throw new Error(`Failed to insert batches: ${error.message}`);
    console.log(`Batches created: ${batches.length}`);
  }

  for (const customer of customers) {
    const { data: existing } = await supabase.from("customer").select("id").eq("name", customer.name).maybeSingle();
    if (existing) continue;
    const { error } = await supabase.from("customer").insert({ ...customer, branch_id: branch.id });
    if (error) throw new Error(`Failed to insert customer ${customer.name}: ${error.message}`);
  }
  console.log(`Customers ready: ${customers.length}`);

  console.log("\nDemo data seeded successfully.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
