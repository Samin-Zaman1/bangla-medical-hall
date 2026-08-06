"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function AdjustBatchControl({ batchId }: { batchId: number }) {
  const router = useRouter();
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/batches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batchId, quantityDelta: Number(delta), reason: reason || undefined }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Adjustment failed");
      return;
    }

    setDelta("");
    setReason("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-1">
      <input
        type="number"
        placeholder="±qty"
        value={delta}
        onChange={(e) => setDelta(e.target.value)}
        required
        className="w-16 rounded-md border border-input bg-background px-1.5 py-1 text-xs text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
      <input
        type="text"
        placeholder="reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="w-24 rounded-md border border-input bg-background px-1.5 py-1 text-xs text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
      <Button type="submit" size="sm" disabled={loading || !delta}>
        {loading ? "…" : "Adjust"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </form>
  );
}
