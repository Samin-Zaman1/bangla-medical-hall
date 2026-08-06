"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

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

export function EditProductForm({
  product,
  canEditSalePrice,
  canEditWholesalePrice,
  onDone,
  onCancel,
}: {
  product: Product;
  canEditSalePrice: boolean;
  canEditWholesalePrice: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [genericName, setGenericName] = useState(product.generic_name);
  const [brandName, setBrandName] = useState(product.brand_name ?? "");
  const [manufacturer, setManufacturer] = useState(product.manufacturer ?? "");
  const [form, setForm] = useState(product.form ?? "");
  const [strength, setStrength] = useState(product.strength ?? "");
  const [salePrice, setSalePrice] = useState(String(product.sale_price));
  const [wholesalePrice, setWholesalePrice] = useState(
    product.wholesale_price != null ? String(product.wholesale_price) : "",
  );
  const [reorderThreshold, setReorderThreshold] = useState(String(product.reorder_threshold));
  const [isControlled, setIsControlled] = useState(product.is_controlled);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const body: Record<string, unknown> = {
      id: product.id,
      genericName,
      brandName: brandName || null,
      manufacturer: manufacturer || null,
      form: form || null,
      strength: strength || null,
      isControlled,
      reorderThreshold: Number(reorderThreshold),
    };
    if (canEditSalePrice) body.salePrice = Number(salePrice);
    if (canEditWholesalePrice) body.wholesalePrice = wholesalePrice ? Number(wholesalePrice) : null;

    const res = await fetch("/api/products", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Could not update product");
      return;
    }

    router.refresh();
    onDone();
  }

  return (
    <form onSubmit={handleSave} className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs">Generic name</Label>
          <Input value={genericName} onChange={(e) => setGenericName(e.target.value)} required className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Brand name</Label>
          <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Manufacturer</Label>
          <Input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Form</Label>
          <Input value={form} onChange={(e) => setForm(e.target.value)} className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Strength</Label>
          <Input value={strength} onChange={(e) => setStrength(e.target.value)} className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Reorder at</Label>
          <Input
            type="number"
            min="0"
            step="1"
            value={reorderThreshold}
            onChange={(e) => setReorderThreshold(e.target.value)}
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
            disabled={!canEditSalePrice}
            className="h-8 text-sm"
          />
          {!canEditSalePrice && <p className="text-[11px] text-muted-foreground">Owner only</p>}
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Wholesale price</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="Not set"
            value={wholesalePrice}
            onChange={(e) => setWholesalePrice(e.target.value)}
            disabled={!canEditWholesalePrice}
            className="h-8 text-sm"
          />
          {!canEditWholesalePrice && <p className="text-[11px] text-muted-foreground">Owner only</p>}
        </div>
      </div>

      <label className="flex w-fit items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={isControlled}
          onChange={(e) => setIsControlled(e.target.checked)}
          className="size-4 rounded border-input accent-primary"
        />
        Controlled substance
      </label>

      <p className="text-xs text-muted-foreground">
        Stock isn&apos;t edited here — it only changes through Purchases, Purchase Invoices, or a manual
        adjustment on the Inventory page.
      </p>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={loading || !genericName}>
          {loading ? "Saving…" : "Save changes"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
