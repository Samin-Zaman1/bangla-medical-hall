"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function PurchaseOrderActions({
  purchaseId,
  orderStatus,
  paymentStatus,
}: {
  purchaseId: number;
  orderStatus: string;
  paymentStatus: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runAction(action: string) {
    setLoading(action);
    setError(null);

    const res = await fetch(`/api/purchases/${purchaseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
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
      {orderStatus === "pending" && (
        <>
          <Button
            type="button"
            size="sm"
            onClick={() => runAction("deliver")}
            disabled={loading !== null}
          >
            {loading === "deliver" ? "…" : "Mark delivered"}
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
      {orderStatus !== "cancelled" && paymentStatus !== "paid" && (
        <Button
          type="button"
          size="sm"
          variant="success"
          onClick={() => runAction("pay")}
          disabled={loading !== null}
        >
          {loading === "pay" ? "…" : "Mark paid"}
        </Button>
      )}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
