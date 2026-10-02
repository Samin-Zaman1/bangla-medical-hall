"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Select, Label } from "@/components/ui/input";

// Larger-than-default fields for the login screen (`!` overrides the base field classes).
const bigField = "h-14 rounded-xl! px-4!";

type LoginUser = {
  id: number;
  name: string;
  role: "owner" | "staff";
};

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? "/sales";

  const [users, setUsers] = useState<LoginUser[]>([]);
  const [userId, setUserId] = useState<number | "">("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);

  useEffect(() => {
    fetch("/api/auth/users")
      .then(async (res) => {
        if (!res.ok) throw new Error("Could not load users");
        return res.json();
      })
      .then((data: { users: LoginUser[] }) => {
        setUsers(data.users);
        if (data.users.length === 1) {
          setUserId(data.users[0].id);
        }
      })
      .catch(() => setError("Could not connect to the server. Is the database set up?"))
      .finally(() => setLoadingUsers(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, pin }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Login failed");
        return;
      }

      router.push(from);
      router.refresh();
    } catch {
      setError("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (loadingUsers) {
    return <p className="text-base text-muted-foreground">Loading…</p>;
  }

  if (users.length === 0) {
    return (
      <div className="space-y-4 text-base text-muted-foreground">
        <p>No users found yet.</p>
        <a href="/setup">
          <Button type="button" size="lg" className="w-full rounded-xl!">
            Set up your pharmacy
          </Button>
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2 text-left">
        <Label htmlFor="user" className="text-base!">
          User
        </Label>
        <Select
          id="user"
          value={userId}
          onChange={(e) => setUserId(Number(e.target.value))}
          required
          className={`${bigField} text-base!`}
        >
          <option value="" disabled>
            Select user
          </option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name} ({user.role})
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-2 text-left">
        <Label htmlFor="pin" className="text-base!">
          PIN
        </Label>
        <Input
          id="pin"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          required
          minLength={4}
          className={`${bigField} text-2xl! tracking-[0.5em]`}
          placeholder="••••"
        />
      </div>

      {error && (
        <p className="rounded-xl bg-destructive-soft px-4 py-3 text-left text-sm text-destructive-soft-foreground" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" disabled={loading || userId === ""} className="w-full rounded-xl!">
        {loading ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
