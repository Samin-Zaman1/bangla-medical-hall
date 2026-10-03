"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function AddSupplierForm() {
  const fieldId = useId();
  const router = useRouter();
  const [name, setName] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        contactInfo: contactInfo || undefined,
        paymentTerms: paymentTerms || undefined,
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Could not add supplier");
      return;
    }

    setName("");
    setContactInfo("");
    setPaymentTerms("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-company-name`}>Company name</Label>
          <Input id={`${fieldId}-company-name`} type="text" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-contact-info`}>Contact info</Label>
          <Input id={`${fieldId}-contact-info`} type="text" value={contactInfo} onChange={(e) => setContactInfo(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-payment-terms`}>Payment terms</Label>
          <Input id={`${fieldId}-payment-terms`} type="text" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" disabled={loading || !name}>
        {loading ? "Saving…" : "Add supplier"}
      </Button>
    </form>
  );
}
