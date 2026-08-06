"use client";

import { useEffect, useState } from "react";
import { ReviewItemRow } from "./review-item-row";

export type ProductOption = { id: number; generic_name: string; brand_name: string | null };

type ItemRow = {
  id: number;
  product_id: number | null;
  raw_extracted_name: string | null;
  quantity: number;
  unit_cost: number | null;
  matched: boolean;
  product: { id: number; generic_name: string; brand_name: string | null } | null;
};

export function ReviewItemsSection({
  purchaseInvoiceId,
  items,
  canEdit,
}: {
  purchaseInvoiceId: number;
  items: ItemRow[];
  canEdit: boolean;
}) {
  const [products, setProducts] = useState<ProductOption[]>([]);

  useEffect(() => {
    if (!canEdit) return;
    fetch("/api/products")
      .then((res) => res.json())
      .then((data) => setProducts(data.products ?? []))
      .catch(() => setProducts([]));
  }, [canEdit]);

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No line items were extracted from this invoice.</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <ReviewItemRow
          key={item.id}
          purchaseInvoiceId={purchaseInvoiceId}
          item={item}
          products={products}
          canEdit={canEdit}
          onProductCreated={(product) => setProducts((prev) => [...prev, product])}
        />
      ))}
    </div>
  );
}
