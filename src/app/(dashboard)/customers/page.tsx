import { redirect } from "next/navigation";
import { Users, Wallet } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { AddCustomerForm } from "@/components/customers/add-customer-form";
import { RecordPaymentControl } from "@/components/customers/record-payment-control";
import { Card, CardHeader } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { PageHeader } from "@/components/ui/page-header";
import { Disclosure } from "@/components/ui/disclosure";

type Customer = {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
  credit_balance: number;
};

async function getCustomers(branchId: number): Promise<Customer[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("customer")
    .select("id, name, phone, address, credit_balance")
    .eq("branch_id", branchId)
    .order("name", { ascending: true });

  if (error) return [];
  return data ?? [];
}

export default async function CustomersPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const customers = await getCustomers(session.branchId);
  const totalCredit = customers.reduce((sum, c) => sum + c.credit_balance, 0);
  const canRecordPayment = hasPermission(session.role, "approve_credit_sale");

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Users}
        title="Customers"
        description="Customer records used for wholesale orders and credit."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <StatTile label="Total customers" value={customers.length} icon={Users} />
        <StatTile
          label="Outstanding credit"
          value={totalCredit}
          icon={Wallet}
          tone={totalCredit > 0 ? "warning" : "default"}
        />
      </div>

      <Disclosure label="Add customer">
        <AddCustomerForm />
      </Disclosure>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-foreground">Customers</h2>
          <span className="text-sm text-muted-foreground">{customers.length} customers</span>
        </CardHeader>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Phone</th>
                <th className="px-3 py-2 font-medium">Address</th>
                <th className="px-3 py-2 font-medium">Credit balance</th>
                {canRecordPayment && <th className="px-3 py-2 font-medium">Payment</th>}
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id} className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50">
                  <td className="px-3 py-2.5 font-medium text-foreground">{customer.name}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{customer.phone ?? "—"}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{customer.address ?? "—"}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{customer.credit_balance}</td>
                  {canRecordPayment && (
                    <td className="px-3 py-2.5">
                      <RecordPaymentControl customerId={customer.id} creditBalance={Number(customer.credit_balance)} />
                    </td>
                  )}
                </tr>
              ))}
              {customers.length === 0 && (
                <tr>
                  <td colSpan={canRecordPayment ? 5 : 4} className="px-3 py-6 text-center text-muted-foreground">
                    No customers yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
