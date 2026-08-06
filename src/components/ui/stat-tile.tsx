import type { LucideIcon } from "lucide-react";

type StatTileProps = {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: "default" | "success" | "warning" | "destructive";
};

const toneClasses: Record<NonNullable<StatTileProps["tone"]>, string> = {
  default: "bg-accent text-accent-foreground",
  success: "bg-success-soft text-success-soft-foreground",
  warning: "bg-warning-soft text-warning-soft-foreground",
  destructive: "bg-destructive-soft text-destructive-soft-foreground",
};

export function StatTile({ label, value, icon: Icon, tone = "default" }: StatTileProps) {
  return (
    <div className="group flex items-center gap-3.5 rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div
        className={`flex size-11 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-105 ${toneClasses[tone]}`}
      >
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold tracking-tight text-foreground">{value}</p>
      </div>
    </div>
  );
}
