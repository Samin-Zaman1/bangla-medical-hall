"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CreateProductInlineForm } from "./create-product-inline-form";
import type { ProductOption } from "./review-items-section";

export function ProductMatchControl({
  products,
  initialSearch,
  onMatch,
  onProductCreated,
}: {
  products: ProductOption[];
  initialSearch: string;
  onMatch: (productId: number) => void;
  onProductCreated: (product: ProductOption) => void;
}) {
  const [search, setSearch] = useState(initialSearch);
  const [showCreate, setShowCreate] = useState(false);

  // Same plain substring match used everywhere else product search appears in this app
  // (src/components/shop/shop-catalog.tsx, src/components/purchases/supplier-order-form.tsx) —
  // there's no server-side fuzzy search anywhere in the codebase to reuse instead.
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter(
        (p) => p.generic_name.toLowerCase().includes(q) || (p.brand_name?.toLowerCase().includes(q) ?? false),
      )
      .slice(0, 8);
  }, [products, search]);

  if (showCreate) {
    return (
      <CreateProductInlineForm
        initialName={search}
        onCreated={(product) => {
          onProductCreated(product);
          onMatch(product.id);
          setShowCreate(false);
        }}
        onCancel={() => setShowCreate(false)}
      />
    );
  }

  return (
    <div className="relative max-w-sm">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="text"
        placeholder="Search products to match…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-8 pl-8 text-sm"
      />
      {search.trim() && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          <ul className="max-h-48 overflow-y-auto">
            {matches.map((product) => (
              <li key={product.id}>
                <button
                  type="button"
                  onClick={() => {
                    onMatch(product.id);
                    setSearch("");
                  }}
                  className="block w-full px-3 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-muted"
                >
                  {product.generic_name}
                  {product.brand_name ? ` — ${product.brand_name}` : ""}
                </button>
              </li>
            ))}
            {matches.length === 0 && (
              <li className="px-3 py-1.5 text-sm text-muted-foreground">No matching products.</li>
            )}
          </ul>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="block w-full border-t border-border px-3 py-1.5 text-left text-sm font-medium text-primary transition-colors hover:bg-muted"
          >
            + Create &quot;{search.trim()}&quot; as a new product
          </button>
        </div>
      )}
    </div>
  );
}
