"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function AddProductForm() {
  const router = useRouter();
  const [genericName, setGenericName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [form, setForm] = useState("");
  const [strength, setStrength] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [wholesalePrice, setWholesalePrice] = useState("");
  const [reorderThreshold, setReorderThreshold] = useState("10");
  const [isControlled, setIsControlled] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    setError(null);

    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        genericName,
        brandName: brandName || undefined,
        form: form || undefined,
        strength: strength || undefined,
        salePrice: Number(salePrice),
        wholesalePrice: wholesalePrice ? Number(wholesalePrice) : undefined,
        reorderThreshold: Number(reorderThreshold),
        isControlled,
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Could not add product");
      return;
    }

    setStatus(`Added: ${data.product.generic_name}`);
    setGenericName("");
    setBrandName("");
    setForm("");
    setStrength("");
    setSalePrice("");
    setWholesalePrice("");
    setReorderThreshold("10");
    setIsControlled(false);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Generic name</Label>
          <Input type="text" value={genericName} onChange={(e) => setGenericName(e.target.value)} required />
        </div>

        <div className="space-y-1.5">
          <Label>Brand name</Label>
          <Input type="text" value={brandName} onChange={(e) => setBrandName(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label>Form</Label>
          <Input type="text" placeholder="Tablet, Syrup…" value={form} onChange={(e) => setForm(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label>Strength</Label>
          <Input type="text" placeholder="500mg" value={strength} onChange={(e) => setStrength(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label>Sale price</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={salePrice}
            onChange={(e) => setSalePrice(e.target.value)}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label>Wholesale price</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="Optional"
            value={wholesalePrice}
            onChange={(e) => setWholesalePrice(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Reorder at</Label>
          <Input
            type="number"
            min="0"
            step="1"
            value={reorderThreshold}
            onChange={(e) => setReorderThreshold(e.target.value)}
          />
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

      {status && <p className="text-sm text-success">{status}</p>}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" disabled={loading || !genericName || !salePrice}>
        {loading ? "Saving…" : "Add product"}
      </Button>
    </form>
  );
}
