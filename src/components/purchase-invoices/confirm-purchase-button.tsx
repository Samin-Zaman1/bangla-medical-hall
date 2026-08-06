"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ConfirmPurchaseButton({
  purchaseInvoiceId,
  disabled,
  unresolvedCount,
}: {
  purchaseInvoiceId: number;
  disabled: boolean;
  unresolvedCount: number;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/purchase-invoices/${purchaseInvoiceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "confirm" }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Could not confirm purchase");
      return;
    }

    router.refresh();
  }

  return (
    <div className="space-y-2">
      {unresolvedCount > 0 && (
        <p className="text-sm text-warning">
          {unresolvedCount} item{unresolvedCount === 1 ? "" : "s"} still need{unresolvedCount === 1 ? "s" : ""} a
          matched product before this purchase can be confirmed.
        </p>
      )}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button type="button" variant="success" onClick={handleConfirm} disabled={disabled || loading}>
        <CheckCircle2 className="mr-1.5 size-4" />
        {loading ? "Confirming…" : "Confirm purchase"}
      </Button>
    </div>
  );
}
