"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CatalogHeaderActions({ kind, label }: { kind: "staff" | "wholesaler"; label: string }) {
  const router = useRouter();

  async function handleSignOut() {
    if (kind === "staff") {
      await fetch("/api/auth", { method: "DELETE" });
      router.push("/login");
    } else {
      await fetch("/api/wholesaler/login", { method: "DELETE" });
      router.push("/wholesaler/login");
    }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground">Signed in as {label}</span>
      <Button type="button" variant="outline" size="sm" onClick={handleSignOut}>
        <LogOut className="mr-1.5 size-3.5" />
        Sign out
      </Button>
    </div>
  );
}
