"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import type { ProductOption } from "./review-items-section";

// Reuses the same POST /api/products endpoint the Products page's AddProductForm uses
// (src/components/products/add-product-form.tsx) — no separate product-creation path.
export function CreateProductInlineForm({
  initialName,
  onCreated,
  onCancel,
}: {
  initialName: string;
  onCreated: (product: ProductOption) => void;
  onCancel: () => void;
}) {
  const [genericName, setGenericName] = useState(initialName);
  const [salePrice, setSalePrice] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setLoading(true);
    setError(null);

    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ genericName, salePrice: Number(salePrice) }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Could not create product");
      return;
    }

    onCreated({
      id: data.product.id,
      generic_name: data.product.generic_name,
      brand_name: data.product.brand_name,
    });
  }

  return (
    <div className="max-w-sm space-y-2 rounded-lg border border-border bg-muted/40 p-3">
      <div className="space-y-1">
        <Label className="text-xs">Generic name</Label>
        <Input
          type="text"
          value={genericName}
          onChange={(e) => setGenericName(e.target.value)}
          className="h-8 text-sm"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Sale price</Label>
        <Input
          type="number"
          min="0"
          step="0.01"
          value={salePrice}
          onChange={(e) => setSalePrice(e.target.value)}
          className="h-8 text-sm"
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={handleCreate} disabled={loading || !genericName || !salePrice}>
          {loading ? "Creating…" : "Create & match"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
