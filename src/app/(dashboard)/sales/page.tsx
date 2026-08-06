"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { History, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Label } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";

type ProductOption = {
  id: number;
  generic_name: string;
  sale_price: number;
};

type CustomerOption = {
  id: number;
  name: string;
};

export default function SalesPage() {
  const router = useRouter();
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [customerId, setCustomerId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/sales")
      .then((res) => res.json())
      .then((data) => setProducts(data.products ?? []))
      .catch(() => setStatus("Could not load products"));

    fetch("/api/customers")
      .then((res) => res.json())
      .then((data) => setCustomers(data.customers ?? []))
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);

    const res = await fetch("/api/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId,
        quantity,
        customerId: customerId || undefined,
        paymentMethod,
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setStatus(data.error ?? "Sale failed");
      return;
    }

    setStatus(`Sale recorded: ${data.sale?.receipt_number ?? "receipt"}`);
    setProductId("");
    setQuantity(1);
    setCustomerId("");
    setPaymentMethod("cash");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ShoppingCart}
        title="Sales"
        description="Basic POS entry with live product selection."
        action={
          <Link href="/sales/history">
            <Button type="button" variant="outline">
              <History className="mr-1.5 size-4" />
              Sales history
            </Button>
          </Link>
        }
      />

      <form
        onSubmit={handleSubmit}
        className="max-w-2xl space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Product</Label>
            <Select value={productId} onChange={(e) => setProductId(e.target.value)} required>
              <option value="">Select product</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.generic_name} — {product.sale_price}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Quantity</Label>
            <Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
          </div>

          <div className="space-y-1.5">
            <Label>Customer (optional)</Label>
            <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Walk-in</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Payment method</Label>
            <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              <option value="cash">Cash</option>
              <option value="bkash">bKash</option>
              <option value="nagad">Nagad</option>
              <option value="credit">Credit (baki)</option>
            </Select>
          </div>
        </div>

        {paymentMethod === "credit" && !customerId && (
          <p className="text-sm text-warning">A customer is required for a credit sale.</p>
        )}

        {status && <p className="text-sm text-muted-foreground">{status}</p>}

        <Button type="submit" disabled={loading || !productId || (paymentMethod === "credit" && !customerId)}>
          {loading ? "Saving…" : "Record sale"}
        </Button>
      </form>
    </div>
  );
}
