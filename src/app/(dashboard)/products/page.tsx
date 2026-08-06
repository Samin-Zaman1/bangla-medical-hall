import { redirect } from "next/navigation";
import { Pill, AlertTriangle, ShieldAlert } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { AddProductForm } from "@/components/products/add-product-form";
import { ProductRow } from "@/components/products/product-row";
import { Card, CardHeader } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { PageHeader } from "@/components/ui/page-header";
import { Disclosure } from "@/components/ui/disclosure";

type Product = {
  id: number;
  generic_name: string;
  brand_name: string | null;
  manufacturer: string | null;
  form: string | null;
  strength: string | null;
  sale_price: number;
  wholesale_price: number | null;
  is_controlled: boolean;
  reorder_threshold: number;
};

async function getProducts(): Promise<Product[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("product")
    .select(
      "id, generic_name, brand_name, manufacturer, form, strength, sale_price, wholesale_price, is_controlled, reorder_threshold",
    )
    .order("generic_name", { ascending: true });

  if (error) return [];
  return data ?? [];
}

async function getStockTotalsByProduct(branchId: number): Promise<Map<number, number>> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("batch").select("product_id, quantity").eq("branch_id", branchId);

  const totals = new Map<number, number>();
  for (const row of data ?? []) {
    if (row.product_id === null) continue;
    totals.set(row.product_id, (totals.get(row.product_id) ?? 0) + row.quantity);
  }
  return totals;
}

export default async function ProductsPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const [products, stockTotals] = await Promise.all([getProducts(), getStockTotalsByProduct(session.branchId)]);
  const canAddProduct = hasPermission(session.role, "add_product");
  const canEditSalePrice = hasPermission(session.role, "edit_sale_price");
  const canEditWholesalePrice = hasPermission(session.role, "edit_wholesale_price");
  const lowStockCount = products.filter(
    (p) => (stockTotals.get(p.id) ?? 0) <= p.reorder_threshold,
  ).length;
  const controlledCount = products.filter((p) => p.is_controlled).length;

  return (
    <div className="space-y-6">
      <PageHeader icon={Pill} title="Products" description="Live product list from Supabase." />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Total products" value={products.length} icon={Pill} />
        <StatTile
          label="Low stock"
          value={lowStockCount}
          icon={AlertTriangle}
          tone={lowStockCount > 0 ? "warning" : "default"}
        />
        <StatTile label="Controlled items" value={controlledCount} icon={ShieldAlert} />
      </div>

      {canAddProduct && (
        <Disclosure label="Add product">
          <AddProductForm />
        </Disclosure>
      )}

      <Card>
        <CardHeader>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Products</h2>
            <p className="text-xs text-muted-foreground">
              Stock is read-only here — it only changes via Purchases, Purchase Invoices, or a manual
              adjustment on the Inventory page.
            </p>
          </div>
          <span className="text-sm text-muted-foreground">{products.length} items</span>
        </CardHeader>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Brand</th>
                <th className="px-3 py-2 font-medium">Form</th>
                <th className="px-3 py-2 font-medium">Strength</th>
                <th className="px-3 py-2 font-medium">Price</th>
                <th className="px-3 py-2 font-medium">Wholesale</th>
                <th className="px-3 py-2 font-medium">Controlled</th>
                <th className="px-3 py-2 font-medium">Stock</th>
                <th className="px-3 py-2 font-medium">Edit</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const totalQuantity = stockTotals.get(product.id) ?? 0;
                const lowStock = totalQuantity <= product.reorder_threshold;

                return (
                  <ProductRow
                    key={product.id}
                    product={product}
                    totalQuantity={totalQuantity}
                    lowStock={lowStock}
                    canEdit={canAddProduct}
                    canEditSalePrice={canEditSalePrice}
                    canEditWholesalePrice={canEditWholesalePrice}
                  />
                );
              })}
              {products.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                    No products yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
