"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function SetupForm() {
  const router = useRouter();

  const [branchName, setBranchName] = useState("Main Pharmacy");
  const [ownerName, setOwnerName] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [alreadySetUp, setAlreadySetUp] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!/^\d{4,6}$/.test(pin)) {
      setError("PIN must be 4-6 digits");
      return;
    }
    if (pin !== confirmPin) {
      setError("PINs do not match");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/setup/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchName, ownerName, pin }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) setAlreadySetUp(true);
        setError(data.error ?? "Setup failed");
        return;
      }

      router.push("/sales");
      router.refresh();
    } catch {
      setError("Setup failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (alreadySetUp) {
    return (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>Setup has already been completed for this pharmacy.</p>
        <a href="/login">
          <Button type="button" className="w-full">
            Go to login
          </Button>
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5 text-left">
        <Label htmlFor="branchName">Pharmacy name</Label>
        <Input id="branchName" type="text" value={branchName} onChange={(e) => setBranchName(e.target.value)} required />
      </div>

      <div className="space-y-1.5 text-left">
        <Label htmlFor="ownerName">Your name</Label>
        <Input
          id="ownerName"
          type="text"
          value={ownerName}
          onChange={(e) => setOwnerName(e.target.value)}
          required
          placeholder="Owner"
        />
      </div>

      <div className="space-y-1.5 text-left">
        <Label htmlFor="pin">PIN (4-6 digits)</Label>
        <Input
          id="pin"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          required
          minLength={4}
          maxLength={6}
          className="tracking-widest"
          placeholder="••••"
        />
      </div>

      <div className="space-y-1.5 text-left">
        <Label htmlFor="confirmPin">Confirm PIN</Label>
        <Input
          id="confirmPin"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          value={confirmPin}
          onChange={(e) => setConfirmPin(e.target.value)}
          required
          minLength={4}
          maxLength={6}
          className="tracking-widest"
          placeholder="••••"
        />
      </div>

      {error && (
        <p className="text-left text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
