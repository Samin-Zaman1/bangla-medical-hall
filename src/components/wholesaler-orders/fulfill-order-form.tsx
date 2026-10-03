"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Item = { id: number; product_id: number; quantity: number; product: { generic_name: string } | null };

export function FulfillOrderForm({ orderId, items }: { orderId: number; items: Item[] }) {
  const router = useRouter();
  const [quantities, setQuantities] = useState<Record<number, string>>(
    Object.fromEntries(items.map((item) => [item.id, String(item.quantity)])),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const payloadItems = items.map((item) => ({
      orderItemId: item.id,
      fulfillQuantity: Number(quantities[item.id] ?? 0),
    }));

    const res = await fetch(`/api/wholesaler-orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "fulfill", items: payloadItems }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Could not fulfill order");
      return;
    }

    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 border-t border-border pt-3">
      <p className="text-xs font-medium text-muted-foreground">
        Confirm quantities to release (defaults to full order):
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="text-foreground">{item.product?.generic_name ?? `Product #${item.product_id}`}</span>
            <Input
              type="number"
              min="0"
              max={item.quantity}
              aria-label={`Quantity to release of ${item.product?.generic_name ?? `product #${item.product_id}`}`}
              value={quantities[item.id] ?? ""}
              onChange={(e) => setQuantities((prev) => ({ ...prev, [item.id]: e.target.value }))}
              className="w-24"
            />
          </div>
        ))}
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" size="sm" disabled={loading}>
        {loading ? "Fulfilling…" : "Confirm fulfillment"}
      </Button>
    </form>
  );
}
