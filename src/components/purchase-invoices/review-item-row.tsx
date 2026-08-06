"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProductMatchControl } from "./product-match-control";
import type { ProductOption } from "./review-items-section";

type ItemRow = {
  id: number;
  product_id: number | null;
  raw_extracted_name: string | null;
  quantity: number;
  unit_cost: number | null;
  matched: boolean;
  product: { id: number; generic_name: string; brand_name: string | null } | null;
};

export function ReviewItemRow({
  purchaseInvoiceId,
  item,
  products,
  canEdit,
  onProductCreated,
}: {
  purchaseInvoiceId: number;
  item: ItemRow;
  products: ProductOption[];
  canEdit: boolean;
  onProductCreated: (product: ProductOption) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [unitCost, setUnitCost] = useState(item.unit_cost != null ? String(item.unit_cost) : "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patchItem(body: Record<string, unknown>) {
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/purchase-invoices/${purchaseInvoiceId}/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Update failed");
      return false;
    }

    router.refresh();
    return true;
  }

  async function handleSaveQuantityCost() {
    const ok = await patchItem({
      quantity: Number(quantity),
      unitCost: unitCost === "" ? null : Number(unitCost),
    });
    if (ok) setEditing(false);
  }

  return (
    <div
      className={`rounded-lg border p-3 ${
        item.product_id === null ? "border-warning/40 bg-warning-soft/30" : "border-border"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-foreground">{item.raw_extracted_name ?? "—"}</p>
          {item.product_id === null && (
            <Badge variant="warning" className="mt-1">
              Unmatched
            </Badge>
          )}
        </div>

        {!editing ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>
              {item.quantity} × {item.unit_cost != null ? `৳${item.unit_cost}` : "—"}
            </span>
            {canEdit && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-muted-foreground underline decoration-dotted transition-colors hover:text-primary"
              >
                edit
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              type="number"
              min="1"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-16 rounded-md border border-input bg-background px-1.5 py-1 text-xs text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              autoFocus
            />
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="unit cost"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              className="w-20 rounded-md border border-input bg-background px-1.5 py-1 text-xs text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <Button type="button" size="sm" onClick={handleSaveQuantityCost} disabled={loading}>
              {loading ? "…" : "Save"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setEditing(false);
                setQuantity(String(item.quantity));
                setUnitCost(item.unit_cost != null ? String(item.unit_cost) : "");
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        )}
      </div>

      {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}

      <div className="mt-2.5">
        {item.product ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-foreground">
              Matched: {item.product.generic_name}
              {item.product.brand_name ? ` — ${item.product.brand_name}` : ""}
            </span>
            {canEdit && (
              <button
                type="button"
                onClick={() => patchItem({ productId: null })}
                className="text-xs text-muted-foreground underline decoration-dotted transition-colors hover:text-destructive"
              >
                unmatch
              </button>
            )}
          </div>
        ) : canEdit ? (
          <ProductMatchControl
            products={products}
            initialSearch={item.raw_extracted_name ?? ""}
            onMatch={(productId) => patchItem({ productId })}
            onProductCreated={onProductCreated}
          />
        ) : null}
      </div>
    </div>
  );
}
