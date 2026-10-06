"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
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
  Menu,
  X,
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

// From md up the sidebar is a column beside the page and can be collapsed to icons. Below md it
// is an off-canvas drawer opened from a top bar; `collapsed` only applies from md up.
export function Sidebar({ navItems, user }: { navItems: NavItem[]; user: SidebarUser }) {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [open, setOpen] = useState(false);
  // Hide labels only on the desktop rail; the phone drawer always shows them.
  const label = collapsed ? "md:hidden" : "";

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function toggleCollapsed() {
    const next = !collapsed;
    localStorage.setItem("sidebar-collapsed", String(next));
    window.dispatchEvent(new Event(SIDEBAR_EVENT));
  }

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-card px-4 py-2.5 md:hidden print:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls="app-sidebar"
          className="rounded-lg p-1.5 text-foreground transition-colors hover:bg-muted"
        >
          <Menu className="size-5" />
        </button>
        <p className="truncate text-sm font-semibold text-foreground">Bangla Medical Hall</p>
      </header>

      {open && <div aria-hidden className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setOpen(false)} />}

      <aside
        id="app-sidebar"
        className={`fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-r border-border bg-card p-3 transition-[transform,visibility,width] duration-200 md:visible md:static md:z-auto md:translate-x-0 print:hidden ${
          open ? "translate-x-0" : "invisible -translate-x-full"
        } ${collapsed ? "md:w-[72px]" : "md:w-64"}`}
      >
        <div className="flex items-center justify-between gap-2 px-1 py-1">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <Pill className="size-5" />
            </div>
            <div className={`min-w-0 ${label}`}>
              <p className="truncate text-sm font-semibold leading-tight text-foreground">Bangla Medical Hall</p>
              <p className="truncate text-xs text-muted-foreground">
                {user.name} · {user.role}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
          >
            <X className="size-4" />
          </button>
          {!collapsed && (
            <button
              type="button"
              onClick={toggleCollapsed}
              title="Collapse sidebar"
              className="hidden shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:block"
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
            className="mt-2 hidden items-center justify-center rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:flex"
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
                onClick={() => setOpen(false)}
                className={`group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-all ${
                  active
                    ? "bg-accent font-medium text-accent-foreground shadow-sm"
                    : "text-foreground/75 hover:translate-x-0.5 hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className={`size-4 shrink-0 transition-transform ${active ? "" : "group-hover:scale-110"}`} />
                <span className={label}>{item.label}</span>
              </Link>
            );
          })}
        </nav>
  
        <div className="mt-auto space-y-1 border-t border-border pt-3">
          <ThemeToggle collapsed={collapsed} />
          <LogoutButton collapsed={collapsed} />
        </div>
      </aside>
    </>
  );
}
