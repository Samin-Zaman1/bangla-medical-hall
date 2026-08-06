"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CatalogEntry = {
  id: number;
  product_id: number;
  cost_price: number | null;
  product: { generic_name: string; brand_name: string | null } | null;
};

export function SupplierOrderForm({ supplierId, catalog }: { supplierId: number; catalog: CatalogEntry[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter((entry) => entry.product?.generic_name.toLowerCase().includes(q));
  }, [catalog, search]);

  const selectedCount = Object.values(quantities).filter((v) => Number(v) > 0).length;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    setError(null);

    const items = catalog
      .filter((entry) => Number(quantities[entry.product_id]) > 0)
      .map((entry) => ({
        productId: entry.product_id,
        quantity: Number(quantities[entry.product_id]),
        costPrice: entry.cost_price ?? undefined,
      }));

    if (items.length === 0) {
      setLoading(false);
      setError("Set a quantity for at least one product");
      return;
    }

    const res = await fetch("/api/purchases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplierId, items }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Could not send order");
      return;
    }

    setStatus(`Order sent — total ${data.purchase.totalAmount}`);
    setQuantities({});
    router.refresh();
  }

  if (catalog.length === 0) {
    return <p className="text-sm text-muted-foreground">Add products to this supplier&apos;s catalog first.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Input
        type="text"
        placeholder="Search this supplier's products…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Product</th>
              <th className="px-3 py-2 font-medium">Cost price</th>
              <th className="px-3 py-2 font-medium">Quantity</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((entry) => (
              <tr key={entry.id} className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50">
                <td className="px-3 py-2.5 text-foreground">{entry.product?.generic_name ?? "—"}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{entry.cost_price ?? "—"}</td>
                <td className="px-3 py-2.5">
                  <input
                    type="number"
                    min="0"
                    value={quantities[entry.product_id] ?? ""}
                    onChange={(e) =>
                      setQuantities((prev) => ({ ...prev, [entry.product_id]: e.target.value }))
                    }
                    className="w-20 rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {status && <p className="text-sm text-success">{status}</p>}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" disabled={loading || selectedCount === 0}>
        {loading ? "Sending…" : `Send order (${selectedCount} item${selectedCount === 1 ? "" : "s"})`}
      </Button>
    </form>
  );
}
