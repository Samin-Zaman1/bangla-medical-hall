"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { EditProductForm } from "./edit-product-form";

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

const COLUMN_COUNT = 9;

export function ProductRow({
  product,
  totalQuantity,
  lowStock,
  canEdit,
  canEditSalePrice,
  canEditWholesalePrice,
}: {
  product: Product;
  totalQuantity: number;
  lowStock: boolean;
  canEdit: boolean;
  canEditSalePrice: boolean;
  canEditWholesalePrice: boolean;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <>
      <tr
        className={`border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50 ${lowStock ? "bg-warning-soft/40" : ""}`}
      >
        <td className="px-3 py-2.5 font-medium text-foreground">{product.generic_name}</td>
        <td className="px-3 py-2.5 text-muted-foreground">{product.brand_name ?? "—"}</td>
        <td className="px-3 py-2.5 text-muted-foreground">{product.form ?? "—"}</td>
        <td className="px-3 py-2.5 text-muted-foreground">{product.strength ?? "—"}</td>
        <td className="px-3 py-2.5 text-muted-foreground">{product.sale_price}</td>
        <td className="px-3 py-2.5 text-muted-foreground">{product.wholesale_price ?? "—"}</td>
        <td className="px-3 py-2.5 text-muted-foreground">{product.is_controlled ? "Yes" : "No"}</td>
        <td className="px-3 py-2.5">
          <span className={lowStock ? "font-semibold text-warning" : "text-muted-foreground"}>{totalQuantity}</span>
          {lowStock && (
            <Badge variant="warning" className="ml-1.5">
              Low stock
            </Badge>
          )}
        </td>
        <td className="px-3 py-2.5">
          {canEdit && (
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="text-muted-foreground underline decoration-dotted transition-colors hover:text-primary"
            >
              {editing ? "close" : "edit"}
            </button>
          )}
        </td>
      </tr>
      {editing && (
        <tr className="border-b border-border/60 last:border-0">
          <td colSpan={COLUMN_COUNT} className="bg-muted/20 px-3 py-3">
            <EditProductForm
              product={product}
              canEditSalePrice={canEditSalePrice}
              canEditWholesalePrice={canEditWholesalePrice}
              onDone={() => setEditing(false)}
              onCancel={() => setEditing(false)}
            />
          </td>
        </tr>
      )}
    </>
  );
}
