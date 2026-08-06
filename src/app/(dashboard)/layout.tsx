import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { getSession } from "@/lib/auth/session";
import { hasPermission, type Permission } from "@/lib/permissions";

const navItems: { href: string; label: string; permission?: Permission }[] = [
  { href: "/sales", label: "Sales" },
  { href: "/inventory", label: "Inventory" },
  { href: "/products", label: "Products" },
  { href: "/purchases", label: "Stock In" },
  { href: "/purchase-invoices", label: "Purchase Invoices" },
  { href: "/wholesale", label: "Wholesale" },
  { href: "/wholesaler-orders", label: "Wholesaler Orders" },
  { href: "/customers", label: "Customers" },
  { href: "/requests", label: "Requests" },
  { href: "/reports", label: "Reports", permission: "view_reports" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const visibleNav = navItems.filter(
    (item) => !item.permission || hasPermission(session.role, item.permission),
  );

  return (
    <div className="flex min-h-full flex-1 bg-background">
      <Sidebar navItems={visibleNav} user={{ name: session.name, role: session.role }} />
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
