"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, ShoppingCart, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type CatalogProduct = {
  id: number;
  generic_name: string;
  brand_name: string | null;
  wholesale_price: number | null;
  stock_quantity: number;
};

export function WholesalerCatalog({ canOrder }: { canOrder: boolean }) {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [cart, setCart] = useState<Record<number, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/wholesaler/catalog")
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((data) => setProducts(data.products ?? []))
      .catch(() => setError("Could not load products"))
      .finally(() => setLoading(false));
  }, []);

  // Same plain substring match as the public retail catalog
  // (src/components/shop/shop-catalog.tsx), for consistency.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => p.generic_name.toLowerCase().includes(q) || (p.brand_name?.toLowerCase().includes(q) ?? false),
    );
  }, [products, search]);

  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const cartLines = useMemo(
    () =>
      Object.entries(cart)
        .map(([productId, quantity]) => ({ product: productsById.get(Number(productId)), quantity }))
        .filter((line): line is { product: CatalogProduct; quantity: number } => Boolean(line.product) && line.quantity > 0),
    [cart, productsById],
  );

  const cartTotal = cartLines.reduce(
    (sum, line) => sum + (Number(line.product.wholesale_price) || 0) * line.quantity,
    0,
  );

  function setQuantity(productId: number, quantity: number) {
    setOrderSuccess(null);
    setCart((prev) => {
      if (quantity <= 0) {
        const next = { ...prev };
        delete next[productId];
        return next;
      }
      return { ...prev, [productId]: quantity };
    });
  }

  async function handlePlaceOrder() {
    if (cartLines.length === 0) return;
    setSubmitting(true);
    setOrderError(null);
    setOrderSuccess(null);

    try {
      const res = await fetch("/api/wholesaler/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cartLines.map((line) => ({ productId: line.product.id, quantity: line.quantity })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setOrderError(data.error ?? "Could not place order");
        return;
      }

      setOrderSuccess(`Order #${data.order.id} placed — total ৳${Number(data.order.totalAmount).toFixed(2)}`);
      setCart({});
    } catch {
      setOrderError("Could not place order. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search products…"
          aria-label="Search products"
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
                    {product.wholesale_price != null ? `৳${Number(product.wholesale_price).toFixed(2)}` : "—"}
                  </span>
                  <Badge variant={outOfStock ? "destructive" : "success"}>
                    {outOfStock ? "Out of stock" : `${product.stock_quantity} in stock`}
                  </Badge>
                </div>
                {canOrder && (
                  <div className="mt-3 flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      placeholder="Qty"
                      aria-label={`Quantity of ${product.generic_name}`}
                      disabled={outOfStock || product.wholesale_price == null}
                      value={cart[product.id] ?? ""}
                      onChange={(e) => setQuantity(product.id, Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                )}
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

      {canOrder && cartLines.length > 0 && (
        <Card className="sticky bottom-4 space-y-4 border-primary/30 shadow-lg">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-medium text-foreground">
              <ShoppingCart className="size-4" />
              Cart ({cartLines.length} item{cartLines.length === 1 ? "" : "s"})
            </div>
            <span className="text-lg font-semibold text-foreground">৳{cartTotal.toFixed(2)}</span>
          </div>

          <ul className="max-h-40 space-y-1.5 overflow-y-auto text-sm">
            {cartLines.map((line) => (
              <li key={line.product.id} className="flex items-center justify-between gap-2 text-muted-foreground">
                <span>
                  {line.product.generic_name} × {line.quantity}
                </span>
                <div className="flex items-center gap-2">
                  <span>৳{((Number(line.product.wholesale_price) || 0) * line.quantity).toFixed(2)}</span>
                  <button
                    type="button"
                    onClick={() => setQuantity(line.product.id, 0)}
                    className="text-muted-foreground transition-colors hover:text-destructive"
                    aria-label={`Remove ${line.product.generic_name}`}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {orderError && (
            <p className="text-sm text-destructive" role="alert">
              {orderError}
            </p>
          )}

          <Button type="button" onClick={handlePlaceOrder} disabled={submitting} className="w-full">
            {submitting ? "Placing order…" : "Place order"}
          </Button>
        </Card>
      )}

      {/* Outside the cart card: a successful order empties the cart, which unmounts the card. */}
      {canOrder && orderSuccess && (
        <p className="rounded-lg bg-success-soft px-4 py-3 text-sm text-success-soft-foreground" role="status">
          {orderSuccess}
        </p>
      )}
    </div>
  );
}
