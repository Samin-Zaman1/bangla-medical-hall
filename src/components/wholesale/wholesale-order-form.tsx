"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, Label } from "@/components/ui/input";

type ProductOption = { id: number; generic_name: string; sale_price: number };
type CustomerOption = { id: number; name: string };
type CartLine = { productId: number; genericName: string; quantity: number; unitPrice: number };

export function WholesaleOrderForm() {
  const fieldId = useId();
  const router = useRouter();
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [productToAdd, setProductToAdd] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/products")
      .then((res) => res.json())
      .then((data: { products?: ProductOption[] }) => setProducts(data.products ?? []))
      .catch(() => setError("Could not load products"));
    fetch("/api/customers")
      .then((res) => res.json())
      .then((data: { customers?: CustomerOption[] }) => setCustomers(data.customers ?? []))
      .catch(() => setError("Could not load customers"));
  }, []);

  const total = cart.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);

  function addToCart() {
    const product = products.find((p) => p.id === Number(productToAdd));
    if (!product) return;
    if (cart.some((line) => line.productId === product.id)) return;

    setCart((prev) => [
      ...prev,
      { productId: product.id, genericName: product.generic_name, quantity: 1, unitPrice: Number(product.sale_price) },
    ]);
    setProductToAdd("");
  }

  function updateLine(productId: number, field: "quantity" | "unitPrice", value: number) {
    setCart((prev) => prev.map((line) => (line.productId === productId ? { ...line, [field]: value } : line)));
  }

  function removeLine(productId: number) {
    setCart((prev) => prev.filter((line) => line.productId !== productId));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (cart.length === 0) {
      setError("Add at least one product");
      return;
    }

    setLoading(true);
    setStatus(null);
    setError(null);

    const res = await fetch("/api/wholesale-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId: customerId || undefined,
        items: cart.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
        })),
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Could not create order");
      return;
    }

    setStatus(`Order created — total ${data.order.totalAmount}`);
    setCart([]);
    setCustomerId("");
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm"
    >
      <h2 className="text-sm font-semibold text-foreground">New wholesale order</h2>

      <div className="space-y-1.5">
        <Label htmlFor={`${fieldId}-customer`}>Customer</Label>
        <Select id={`${fieldId}-customer`} value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="md:w-64">
          <option value="">Walk-in / no customer</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="w-56 space-y-1.5">
          <Label htmlFor={`${fieldId}-add-product`}>Add product</Label>
          <Select id={`${fieldId}-add-product`} value={productToAdd} onChange={(e) => setProductToAdd(e.target.value)}>
            <option value="">Select product</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.generic_name}
              </option>
            ))}
          </Select>
        </div>
        <Button type="button" variant="outline" onClick={addToCart} disabled={!productToAdd}>
          Add to order
        </Button>
      </div>

      {cart.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">Product</th>
                <th className="px-3 py-2 font-medium">Quantity</th>
                <th className="px-3 py-2 font-medium">Unit price</th>
                <th className="px-3 py-2 font-medium">Subtotal</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {cart.map((line) => (
                <tr key={line.productId} className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50">
                  <td className="px-3 py-2.5 text-foreground">{line.genericName}</td>
                  <td className="px-3 py-2.5">
                    <input
                      type="number"
                      min="1"
                      value={line.quantity}
                      onChange={(e) => updateLine(line.productId, "quantity", Number(e.target.value))}
                      className="w-20 rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.unitPrice}
                      onChange={(e) => updateLine(line.productId, "unitPrice", Number(e.target.value))}
                      className="w-24 rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{(line.quantity * line.unitPrice).toFixed(2)}</td>
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => removeLine(line.productId)}
                      className="text-xs text-destructive transition-colors hover:underline"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-sm font-medium text-foreground">Total: {total.toFixed(2)}</p>

      {status && <p className="text-sm text-success">{status}</p>}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" disabled={loading || cart.length === 0}>
        {loading ? "Creating…" : "Create order"}
      </Button>
    </form>
  );
}
