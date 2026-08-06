import type { ReactNode } from "react";
import { Warehouse, PackageCheck, TrendingUp, ShieldCheck } from "lucide-react";

const FEATURES = [
  { icon: PackageCheck, text: "Live stock counts on every product" },
  { icon: TrendingUp, text: "Wholesale pricing, updated in real time" },
  { icon: ShieldCheck, text: "Your own secure account, separate from store staff logins" },
];

export function WholesalerAuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-full flex-1 bg-background">
      <div className="hidden flex-1 flex-col justify-between bg-gradient-to-br from-primary to-primary-hover p-10 text-primary-foreground lg:flex">
        <div className="flex items-center gap-2.5">
          <div className="flex size-10 items-center justify-center rounded-xl bg-white/15">
            <Warehouse className="size-5" />
          </div>
          <span className="text-lg font-semibold">Bangla Medical Hall · Wholesale</span>
        </div>

        <div className="space-y-6">
          <h2 className="max-w-md text-3xl font-semibold leading-tight">
            Order stock at wholesale prices, straight from the source.
          </h2>
          <ul className="space-y-3">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-primary-foreground/90">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/15">
                  <Icon className="size-4" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-primary-foreground/70">
          A separate account system from in-store staff logins.
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6 rounded-2xl border border-border bg-card p-8 shadow-lg shadow-black/[0.03]">
          <div className="space-y-2 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground shadow-sm lg:hidden">
              <Warehouse className="size-7" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}
