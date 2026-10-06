"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Select, Label } from "@/components/ui/input";

type ProductOption = { id: number; generic_name: string };

export function CatalogAddForm({ supplierId }: { supplierId: number }) {
  const fieldId = useId();
  const router = useRouter();
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [productId, setProductId] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/products")
      .then((res) => res.json())
      .then((data: { products?: ProductOption[] }) => setProducts(data.products ?? []))
      .catch(() => setError("Could not load products"));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/suppliers/${supplierId}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, costPrice: costPrice || undefined }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Could not add to catalog");
      return;
    }

    setProductId("");
    setCostPrice("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div className="w-56 space-y-1.5">
        <Label htmlFor={`${fieldId}-product`}>Product</Label>
        <Select id={`${fieldId}-product`} value={productId} onChange={(e) => setProductId(e.target.value)} required>
          <option value="">Select product</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.generic_name}
            </option>
          ))}
        </Select>
      </div>

      <div className="w-32 space-y-1.5">
        <Label htmlFor={`${fieldId}-cost-price`}>Cost price</Label>
        <Input id={`${fieldId}-cost-price`} type="number" min="0" step="0.01" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} />
      </div>

      <Button type="submit" disabled={loading || !productId}>
        {loading ? "Adding…" : "Add to catalog"}
      </Button>

      {error && <span className="text-xs text-destructive">{error}</span>}
    </form>
  );
}
