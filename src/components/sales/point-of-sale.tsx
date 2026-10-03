"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Minus,
  PackageX,
  Plus,
  Printer,
  Search,
  ShieldAlert,
  ShoppingBasket,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export type PosProduct = {
  id: number;
  genericName: string;
  brandName: string | null;
  form: string | null;
  strength: string | null;
  salePrice: number;
  isControlled: boolean;
  stock: number;
};

export type PosCustomer = {
  id: number;
  name: string;
  phone: string | null;
  creditBalance: number;
};

type CartLine = { productId: number; quantity: number };

type CompletedSale = {
  id: number;
  receiptNumber: string;
  totalPaisa: number;
  changePaisa: number | null;
};

const LOW_STOCK = 10;

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bkash", label: "bKash" },
  { value: "nagad", label: "Nagad" },
  { value: "credit", label: "Credit (baki)" },
] as const;

// All money math is done in whole paisa so totals never drift from floating-point rounding.
const toPaisa = (taka: number) => Math.round(taka * 100);

function formatTaka(paisa: number): string {
  return `৳${(paisa / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function productDetails(p: PosProduct): string {
  return [p.brandName, p.strength, p.form].filter(Boolean).join(" · ");
}

export function PointOfSale({
  products,
  customers,
  canApplyDiscount,
  canSellOnCredit,
}: {
  products: PosProduct[];
  customers: PosCustomer[];
  canApplyDiscount: boolean;
  canSellOnCredit: boolean;
}) {
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [discountInput, setDiscountInput] = useState("");
  const [cashInput, setCashInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState<CompletedSale | null>(null);

  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const results = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return products;
    return products.filter((p) => {
      const haystack = `${p.genericName} ${productDetails(p)}`.toLowerCase();
      return terms.every((t) => haystack.includes(t));
    });
  }, [products, query]);

  const lines = cart
    .map((line) => {
      const product = productsById.get(line.productId);
      return product ? { ...line, product, totalPaisa: toPaisa(product.salePrice) * line.quantity } : null;
    })
    .filter((line) => line !== null);

  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);
  const subtotalPaisa = lines.reduce((sum, l) => sum + l.totalPaisa, 0);
  const discountPaisa = canApplyDiscount ? Math.max(0, toPaisa(Number(discountInput) || 0)) : 0;
  const discountTooBig = discountPaisa > subtotalPaisa;
  const totalPaisa = Math.max(0, subtotalPaisa - discountPaisa);
  const cashPaisa = cashInput === "" ? null : toPaisa(Number(cashInput) || 0);
  const changePaisa = paymentMethod === "cash" && cashPaisa !== null ? cashPaisa - totalPaisa : null;

  const overStock = lines.some((l) => l.quantity > l.product.stock);
  const needsCustomer = paymentMethod === "credit" && !customerId;
  const canComplete =
    lines.length > 0 && lines.every((l) => l.quantity > 0) && !overStock && !discountTooBig && !needsCustomer;

  function quantityInCart(productId: number) {
    return cart.find((l) => l.productId === productId)?.quantity ?? 0;
  }

  function addProduct(product: PosProduct) {
    if (product.stock <= 0) return;
    setError(null);
    setCompleted(null);
    setCart((current) => {
      const existing = current.find((l) => l.productId === product.id);
      if (existing) {
        return current.map((l) =>
          l.productId === product.id ? { ...l, quantity: Math.min(product.stock, l.quantity + 1) } : l,
        );
      }
      return [...current, { productId: product.id, quantity: 1 }];
    });
    setQuery("");
    setHighlight(0);
    searchRef.current?.focus();
  }

  function setQuantity(productId: number, quantity: number) {
    const stock = productsById.get(productId)?.stock ?? 0;
    const clamped = Math.max(0, Math.min(stock, Math.floor(quantity)));
    setCart((current) => current.map((l) => (l.productId === productId ? { ...l, quantity: clamped } : l)));
  }

  function removeLine(productId: number) {
    setCart((current) => current.filter((l) => l.productId !== productId));
  }

  function resetBill() {
    setCart([]);
    setCustomerId("");
    setPaymentMethod("cash");
    setDiscountInput("");
    setCashInput("");
    setError(null);
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const product = results[highlight];
      if (product) addProduct(product);
    } else if (e.key === "Escape") {
      setQuery("");
      setHighlight(0);
    }
  }

  async function completeSale() {
    if (!canComplete || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
          customerId: customerId || undefined,
          paymentMethod,
          discountAmount: discountPaisa / 100,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Sale failed");
        return;
      }

      setCompleted({
        id: data.sale.id,
        receiptNumber: data.sale.receipt_number,
        totalPaisa: toPaisa(Number(data.sale.total_amount)),
        changePaisa: changePaisa !== null && changePaisa >= 0 ? changePaisa : null,
      });
      resetBill();
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]">
      {/* Product picker */}
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlight(0);
            }}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search medicine by name, brand or strength…"
            aria-label="Search products"
            className="h-12 rounded-xl! pl-12! text-base!"
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Tip: type to search, use ↑ ↓ to pick and press Enter to add to the bill.
        </p>

        <ul className="mt-4 max-h-[32rem] space-y-1.5 overflow-y-auto pr-1">
          {results.map((product, index) => {
            const outOfStock = product.stock <= 0;
            const inCart = quantityInCart(product.id);
            return (
              <li key={product.id}>
                <button
                  type="button"
                  disabled={outOfStock}
                  onClick={() => addProduct(product)}
                  onMouseEnter={() => setHighlight(index)}
                  className={`flex w-full items-center gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    index === highlight && !outOfStock
                      ? "border-primary/50 bg-accent"
                      : "border-transparent hover:bg-muted"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate font-medium text-foreground">
                      {product.genericName}
                      {product.isControlled && (
                        <ShieldAlert className="size-4 shrink-0 text-warning" aria-label="Controlled medicine" />
                      )}
                    </p>
                    {productDetails(product) && (
                      <p className="truncate text-sm text-muted-foreground">{productDetails(product)}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold text-foreground">{formatTaka(toPaisa(product.salePrice))}</p>
                    {outOfStock ? (
                      <Badge variant="destructive">Out of stock</Badge>
                    ) : (
                      <Badge variant={product.stock <= LOW_STOCK ? "warning" : "neutral"}>
                        {product.stock} in stock{inCart > 0 ? ` · ${inCart} in bill` : ""}
                      </Badge>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
          {results.length === 0 && (
            <li className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <PackageX className="size-8" />
              No products match “{query}”.
            </li>
          )}
        </ul>
      </section>

      {/* Bill */}
      <section className="rounded-xl border border-border bg-card shadow-sm lg:sticky lg:top-6">
        {completed && cart.length === 0 ? (
          <div className="flex flex-col items-center gap-4 p-8 text-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-success-soft text-success-soft-foreground">
              <CheckCircle2 className="size-9" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">Sale complete</h2>
              <p className="text-sm text-muted-foreground">{completed.receiptNumber}</p>
            </div>
            <p className="text-3xl font-bold tracking-tight text-foreground">{formatTaka(completed.totalPaisa)}</p>
            {completed.changePaisa !== null && completed.changePaisa > 0 && (
              <p className="rounded-lg bg-accent px-4 py-2 text-base font-medium text-accent-foreground">
                Return change: {formatTaka(completed.changePaisa)}
              </p>
            )}
            <div className="grid w-full gap-2 sm:grid-cols-2">
              <Link href={`/sales/history/${completed.id}`}>
                <Button type="button" variant="outline" size="lg" className="inline-flex w-full items-center justify-center">
                  <Printer className="mr-1.5 size-4" />
                  View / print receipt
                </Button>
              </Link>
              <Button
                type="button"
                size="lg"
                autoFocus
                onClick={() => {
                  setCompleted(null);
                  searchRef.current?.focus();
                }}
              >
                New sale
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="flex items-center gap-2 font-semibold text-foreground">
                <ShoppingBasket className="size-5 text-primary" />
                Current bill
              </h2>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {itemCount} {itemCount === 1 ? "item" : "items"}
                </span>
                {lines.length > 0 && (
                  <button
                    type="button"
                    onClick={resetBill}
                    className="text-sm font-medium text-destructive hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {lines.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-5 py-12 text-center text-sm text-muted-foreground">
                <ShoppingBasket className="size-10 opacity-40" />
                <p>The bill is empty.</p>
                <p>Search and click a product to add it.</p>
              </div>
            ) : (
              <ul className="max-h-[22rem] divide-y divide-border overflow-y-auto">
                {lines.map((line) => (
                  <li key={line.productId} className="space-y-2 px-5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{line.product.genericName}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatTaka(toPaisa(line.product.salePrice))} each
                        </p>
                      </div>
                      <p className="shrink-0 font-semibold text-foreground">{formatTaka(line.totalPaisa)}</p>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center rounded-lg border border-input">
                        <button
                          type="button"
                          aria-label="Decrease quantity"
                          onClick={() =>
                            line.quantity <= 1 ? removeLine(line.productId) : setQuantity(line.productId, line.quantity - 1)
                          }
                          className="px-2.5 py-1.5 text-muted-foreground hover:text-foreground"
                        >
                          <Minus className="size-4" />
                        </button>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={line.product.stock}
                          value={line.quantity === 0 ? "" : line.quantity}
                          onChange={(e) => setQuantity(line.productId, Number(e.target.value) || 0)}
                          onBlur={() => line.quantity === 0 && setQuantity(line.productId, 1)}
                          aria-label={`Quantity of ${line.product.genericName}`}
                          className="w-14 border-x border-input bg-transparent py-1.5 text-center text-sm font-medium text-foreground focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <button
                          type="button"
                          aria-label="Increase quantity"
                          disabled={line.quantity >= line.product.stock}
                          onClick={() => setQuantity(line.productId, line.quantity + 1)}
                          className="px-2.5 py-1.5 text-muted-foreground hover:text-foreground disabled:opacity-40"
                        >
                          <Plus className="size-4" />
                        </button>
                      </div>
                      {line.quantity >= line.product.stock && (
                        <span className="text-xs text-warning">Max stock ({line.product.stock})</span>
                      )}
                      <button
                        type="button"
                        aria-label={`Remove ${line.product.genericName}`}
                        onClick={() => removeLine(line.productId)}
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive-soft hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="space-y-4 border-t border-border px-5 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="pos-customer">Customer</Label>
                <Select id="pos-customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                  <option value="">Walk-in customer</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.phone ? ` (${c.phone})` : ""}
                      {c.creditBalance > 0 ? ` — owes ${formatTaka(toPaisa(c.creditBalance))}` : ""}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Payment method</Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
                  {PAYMENT_METHODS.filter((m) => m.value !== "credit" || canSellOnCredit).map((method) => (
                    <button
                      key={method.value}
                      type="button"
                      onClick={() => setPaymentMethod(method.value)}
                      aria-pressed={paymentMethod === method.value}
                      className={`rounded-lg border px-2 py-2 text-sm font-medium transition-colors ${
                        paymentMethod === method.value
                          ? "border-primary bg-accent text-accent-foreground"
                          : "border-input text-foreground hover:bg-muted"
                      }`}
                    >
                      {method.label}
                    </button>
                  ))}
                </div>
                {needsCustomer && (
                  <p className="text-sm text-warning">Choose a customer to put this sale on credit.</p>
                )}
              </div>

              <div className={`grid gap-3 ${canApplyDiscount && paymentMethod === "cash" ? "grid-cols-2" : "grid-cols-1"}`}>
                {canApplyDiscount && (
                  <div className="space-y-1.5">
                    <Label htmlFor="pos-discount">Discount (৳)</Label>
                    <Input
                      id="pos-discount"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={discountInput}
                      onChange={(e) => setDiscountInput(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                )}
                {paymentMethod === "cash" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="pos-cash">Cash received (৳)</Label>
                    <Input
                      id="pos-cash"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={cashInput}
                      onChange={(e) => setCashInput(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                )}
              </div>

              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <dt>Subtotal</dt>
                  <dd>{formatTaka(subtotalPaisa)}</dd>
                </div>
                {discountPaisa > 0 && (
                  <div className={`flex justify-between ${discountTooBig ? "text-destructive" : "text-muted-foreground"}`}>
                    <dt>Discount{discountTooBig ? " (more than subtotal)" : ""}</dt>
                    <dd>−{formatTaka(discountPaisa)}</dd>
                  </div>
                )}
                <div className="flex items-baseline justify-between border-t border-border pt-2">
                  <dt className="text-base font-semibold text-foreground">Total</dt>
                  <dd className="text-2xl font-bold tracking-tight text-foreground">{formatTaka(totalPaisa)}</dd>
                </div>
                {changePaisa !== null && lines.length > 0 && (
                  <div
                    className={`flex justify-between font-medium ${changePaisa < 0 ? "text-destructive" : "text-primary"}`}
                  >
                    <dt>{changePaisa < 0 ? "Still due" : "Change to return"}</dt>
                    <dd>{formatTaka(Math.abs(changePaisa))}</dd>
                  </div>
                )}
              </dl>

              {error && (
                <p className="rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive-soft-foreground" role="alert">
                  {error}
                </p>
              )}

              <Button
                type="button"
                size="lg"
                className="w-full"
                disabled={!canComplete || submitting}
                onClick={completeSale}
              >
                {submitting ? "Completing sale…" : `Complete sale · ${formatTaka(totalPaisa)}`}
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
