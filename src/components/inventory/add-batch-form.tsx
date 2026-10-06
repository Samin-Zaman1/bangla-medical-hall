"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Select, Label } from "@/components/ui/input";

type ProductOption = {
  id: number;
  generic_name: string;
};

export function AddBatchForm() {
  const fieldId = useId();
  const router = useRouter();
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [expiryDate, setExpiryDate] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [status, setStatus] = useState<string | null>(null);
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
    setStatus(null);
    setError(null);

    const res = await fetch("/api/batches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId,
        quantity,
        expiryDate: expiryDate || undefined,
        batchNumber: batchNumber || undefined,
        costPrice: costPrice || undefined,
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Could not add batch");
      return;
    }

    setStatus(`Batch added: ${quantity} unit(s).`);
    setProductId("");
    setQuantity(1);
    setExpiryDate("");
    setBatchNumber("");
    setCostPrice("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
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

        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-quantity`}>Quantity</Label>
          <Input id={`${fieldId}-quantity`} type="number" min="1" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-expiry-date`}>Expiry date</Label>
          <Input id={`${fieldId}-expiry-date`} type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-batch-number`}>Batch number</Label>
          <Input id={`${fieldId}-batch-number`} type="text" value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-cost-price`}>Cost price</Label>
          <Input id={`${fieldId}-cost-price`}
            type="number"
            min="0"
            step="0.01"
            value={costPrice}
            onChange={(e) => setCostPrice(e.target.value)}
          />
        </div>
      </div>

      {status && <p className="text-sm text-success">{status}</p>}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" disabled={loading || !productId}>
        {loading ? "Saving…" : "Add batch"}
      </Button>
    </form>
  );
}
