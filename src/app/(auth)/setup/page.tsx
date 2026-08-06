import { redirect } from "next/navigation";
import { Pill } from "lucide-react";
import { SetupForm } from "@/components/auth/setup-form";
import { hasExistingUsers } from "@/lib/setup-guard";

export default async function SetupPage() {
  if (await hasExistingUsers()) {
    redirect("/login");
  }

  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-border bg-card p-8 shadow-lg shadow-black/[0.03]">
        <div className="space-y-2 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground shadow-sm">
            <Pill className="size-7" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Set up your pharmacy</h1>
          <p className="text-sm text-muted-foreground">Create the first owner account to get started</p>
        </div>
        <SetupForm />
      </div>
    </main>
  );
}
