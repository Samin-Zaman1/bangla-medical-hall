"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function OrderStatusActions({ orderId, status }: { orderId: number; status: string }) {
  const router = useRouter();
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runAction(action: string, extra?: Record<string, unknown>) {
    setLoading(action);
    setError(null);

    const res = await fetch(`/api/wholesale-orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });

    const data = await res.json();
    setLoading(null);

    if (!res.ok) {
      setError(data.error ?? "Action failed");
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {status === "pending" && (
        <>
          <Button type="button" size="sm" onClick={() => runAction("prepare")} disabled={loading !== null}>
            {loading === "prepare" ? "…" : "Mark prepared"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => runAction("cancel")}
            disabled={loading !== null}
          >
            {loading === "cancel" ? "…" : "Cancel"}
          </Button>
        </>
      )}
      {status === "prepared" && (
        <>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            className="rounded border border-input bg-card px-1 py-0.5 text-xs text-foreground"
          >
            <option value="cash">Cash</option>
            <option value="bkash">bKash</option>
            <option value="nagad">Nagad</option>
            <option value="credit">Credit</option>
          </select>
          <Button
            type="button"
            size="sm"
            variant="success"
            onClick={() => runAction("pay", { paymentMethod })}
            disabled={loading !== null}
          >
            {loading === "pay" ? "…" : "Mark paid"}
          </Button>
        </>
      )}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
