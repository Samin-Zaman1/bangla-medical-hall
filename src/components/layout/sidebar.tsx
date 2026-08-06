"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ShoppingCart,
  Warehouse,
  Pill,
  PackagePlus,
  ReceiptText,
  Truck,
  Inbox,
  Users,
  ClipboardList,
  BarChart3,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { LogoutButton } from "@/components/auth/logout-button";

type NavItem = { href: string; label: string };
type SidebarUser = { name: string; role: string };

const SIDEBAR_EVENT = "sidebar-collapsed-change";

function subscribe(callback: () => void) {
  window.addEventListener(SIDEBAR_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(SIDEBAR_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function getSnapshot() {
  return localStorage.getItem("sidebar-collapsed") === "true";
}

function getServerSnapshot() {
  return false;
}

const ICONS: Record<string, LucideIcon> = {
  "/sales": ShoppingCart,
  "/inventory": Warehouse,
  "/products": Pill,
  "/purchases": PackagePlus,
  "/purchase-invoices": ReceiptText,
  "/wholesale": Truck,
  "/wholesaler-orders": Inbox,
  "/customers": Users,
  "/requests": ClipboardList,
  "/reports": BarChart3,
};

export function Sidebar({ navItems, user }: { navItems: NavItem[]; user: SidebarUser }) {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggleCollapsed() {
    const next = !collapsed;
    localStorage.setItem("sidebar-collapsed", String(next));
    window.dispatchEvent(new Event(SIDEBAR_EVENT));
  }

  return (
    <aside
      className={`flex shrink-0 flex-col border-r border-border bg-card p-3 transition-[width] duration-200 print:hidden ${
        collapsed ? "w-[72px]" : "w-64"
      }`}
    >
      <div className="flex items-center justify-between gap-2 px-1 py-1">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <Pill className="size-5" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight text-foreground">Pharmacy POS</p>
              <p className="truncate text-xs text-muted-foreground">
                {user.name} · {user.role}
              </p>
            </div>
          )}
        </div>
        {!collapsed && (
          <button
            type="button"
            onClick={toggleCollapsed}
            title="Collapse sidebar"
            className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <PanelLeftClose className="size-4" />
          </button>
        )}
      </div>

      {collapsed && (
        <button
          type="button"
          onClick={toggleCollapsed}
          title="Expand sidebar"
          className="mt-2 flex items-center justify-center rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <PanelLeftOpen className="size-4" />
        </button>
      )}

      <nav className="mt-5 flex flex-col gap-1">
        {navItems.map((item) => {
          const Icon = ICONS[item.href] ?? LayoutGrid;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-all ${
                active
                  ? "bg-accent font-medium text-accent-foreground shadow-sm"
                  : "text-foreground/75 hover:translate-x-0.5 hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className={`size-4 shrink-0 transition-transform ${active ? "" : "group-hover:scale-110"}`} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-1 border-t border-border pt-3">
        <ThemeToggle collapsed={collapsed} />
        <LogoutButton collapsed={collapsed} />
      </div>
    </aside>
  );
}
