"use client";

import { useState, type ReactNode } from "react";
import { Plus, Minus } from "lucide-react";

export function Disclosure({
  label,
  defaultOpen = false,
  children,
}: {
  label: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-5 py-3.5 text-left text-sm font-semibold text-foreground transition-colors hover:bg-muted/60"
      >
        {label}
        {open ? (
          <Minus className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <Plus className="size-4 shrink-0 text-muted-foreground" />
        )}
      </button>
      {open && <div className="border-t border-border p-5">{children}</div>}
    </div>
  );
}
