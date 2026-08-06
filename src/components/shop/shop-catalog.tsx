"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type CatalogProduct = {
  id: number;
  generic_name: string;
  brand_name: string | null;
  retail_price: number;
  stock_quantity: number;
};

export function ShopCatalog() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/shop/products")
      .then((res) => res.json())
      .then((data) => setProducts(data.products ?? []))
      .catch(() => setError("Could not load products"))
      .finally(() => setLoading(false));
  }, []);

  // Same plain substring match already used for the supplier product picker
  // (src/components/purchases/supplier-order-form.tsx) — there's no fuzzy/trigram search
  // anywhere else in the app to reuse instead.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => p.generic_name.toLowerCase().includes(q) || (p.brand_name?.toLowerCase().includes(q) ?? false),
    );
  }, [products, search]);

  return (
    <div className="space-y-6">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search products…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && <p className="text-sm text-muted-foreground">Loading products…</p>}

      {!loading && !error && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((product) => {
            const outOfStock = product.stock_quantity <= 0;
            return (
              <Card key={product.id} className="flex flex-col justify-between">
                <div>
                  <h3 className="font-medium text-foreground">{product.generic_name}</h3>
                  {product.brand_name && (
                    <p className="text-sm text-muted-foreground">{product.brand_name}</p>
                  )}
                </div>
                <div className="mt-4 flex items-end justify-between gap-2">
                  <span className="text-lg font-semibold text-foreground">
                    ৳{Number(product.retail_price).toFixed(2)}
                  </span>
                  <Badge variant={outOfStock ? "destructive" : "success"}>
                    {outOfStock ? "Out of stock" : `${product.stock_quantity} in stock`}
                  </Badge>
                </div>
              </Card>
            );
          })}
          {filtered.length === 0 && (
            <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
              No products match your search.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
