"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function RecordPaymentControl({ customerId, creditBalance }: { customerId: number; creditBalance: number }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setLoading(true);
    setError(null);

    const res = await fetch("/api/credit-payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId, amount: Number(amount) }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Could not record payment");
      return;
    }

    setEditing(false);
    setAmount("");
    router.refresh();
  }

  if (creditBalance <= 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-muted-foreground underline decoration-dotted transition-colors hover:text-primary"
      >
        record payment
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        min="0.01"
        step="0.01"
        max={creditBalance}
        placeholder="amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-20 rounded-md border border-input bg-background px-1.5 py-1 text-xs text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        autoFocus
      />
      <Button type="button" size="sm" onClick={handleSave} disabled={loading || !amount}>
        {loading ? "…" : "Save"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          setEditing(false);
          setAmount("");
          setError(null);
        }}
      >
        Cancel
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
