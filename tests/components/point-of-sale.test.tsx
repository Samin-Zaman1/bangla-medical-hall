import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PointOfSale, type PosCustomer, type PosProduct } from "@/components/sales/point-of-sale";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }) }));

const PRODUCTS: PosProduct[] = [
  { id: 1, genericName: "Paracetamol", brandName: "Napa", form: "Tablet", strength: "500mg", salePrice: 2.5, isControlled: false, stock: 50 },
  { id: 2, genericName: "Omeprazole", brandName: "Seclo", form: "Capsule", strength: "20mg", salePrice: 7, isControlled: false, stock: 3 },
  { id: 3, genericName: "Diazepam", brandName: null, form: null, strength: "5mg", salePrice: 1.1, isControlled: true, stock: 20 },
  { id: 4, genericName: "Azithromycin", brandName: "Zimax", form: null, strength: null, salePrice: 35, isControlled: false, stock: 0 },
];

const CUSTOMERS: PosCustomer[] = [{ id: 9, name: "Karim", phone: "01711", creditBalance: 120 }];

function setup(props: Partial<React.ComponentProps<typeof PointOfSale>> = {}) {
  const user = userEvent.setup();
  render(<PointOfSale products={PRODUCTS} customers={CUSTOMERS} canApplyDiscount canSellOnCredit {...props} />);
  return { user, search: screen.getByRole("textbox", { name: "Search products" }) };
}

const productButton = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) });
const bill = () => screen.getByRole("heading", { name: "Current bill" }).closest("section")!;
const completeButton = () => screen.getByRole("button", { name: /Complete sale/ });

function mockFetch(response: { ok: boolean; body: unknown }) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: response.ok, json: async () => response.body });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  refresh.mockReset();
});

describe("PointOfSale", () => {
  it("starts with an empty bill and a disabled Complete button", () => {
    setup();
    expect(within(bill()).getByText("The bill is empty.")).toBeInTheDocument();
    expect(completeButton()).toBeDisabled();
  });

  it("searches across generic name, brand and strength, all terms required", async () => {
    const { user, search } = setup();

    await user.type(search, "napa 500");
    expect(productButton("Paracetamol")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Omeprazole/ })).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "zzz");
    expect(screen.getByText(/No products match/)).toBeInTheDocument();
  });

  it("disables out-of-stock products", () => {
    setup();
    expect(productButton("Azithromycin")).toBeDisabled();
  });

  it("adds products and totals the bill", async () => {
    const { user } = setup();

    await user.click(productButton("Paracetamol"));
    await user.click(productButton("Paracetamol"));
    await user.click(productButton("Omeprazole"));

    expect(within(bill()).getByText("3 items")).toBeInTheDocument();
    expect(completeButton()).toHaveTextContent("৳12.00"); // 2 × 2.50 + 7.00
    expect(completeButton()).toBeEnabled();
  });

  it("keyboard: arrows move the highlight, Enter adds, search clears", async () => {
    const { user, search } = setup();

    await user.type(search, "{ArrowDown}{Enter}");

    expect(within(bill()).getByText("Omeprazole")).toBeInTheDocument();
    expect(search).toHaveValue("");
  });

  it("never lets quantity exceed stock", async () => {
    const { user } = setup();
    await user.click(productButton("Omeprazole")); // stock 3

    const increase = within(bill()).getByRole("button", { name: "Increase quantity" });
    await user.click(increase);
    await user.click(increase);
    expect(increase).toBeDisabled();
    expect(within(bill()).getByText("Max stock (3)")).toBeInTheDocument();

    const qty = within(bill()).getByRole("spinbutton", { name: "Quantity of Omeprazole" });
    await user.clear(qty);
    await user.type(qty, "99");
    expect(qty).toHaveValue(3);

    // Clicking the product again doesn't push past stock either.
    await user.click(productButton("Omeprazole"));
    expect(qty).toHaveValue(3);
  });

  it("decreasing from 1 removes the line", async () => {
    const { user } = setup();
    await user.click(productButton("Paracetamol"));
    await user.click(within(bill()).getByRole("button", { name: "Decrease quantity" }));
    expect(within(bill()).getByText("The bill is empty.")).toBeInTheDocument();
  });

  describe("payment rules", () => {
    it("shows change to return for cash", async () => {
      const { user } = setup();
      await user.click(productButton("Omeprazole")); // 7.00
      await user.type(screen.getByLabelText("Cash received (৳)"), "10");
      expect(screen.getByText("Change to return").nextSibling).toHaveTextContent("৳3.00");
    });

    it("blocks a discount bigger than the subtotal", async () => {
      const { user } = setup();
      await user.click(productButton("Omeprazole"));
      await user.type(screen.getByLabelText("Discount (৳)"), "8");
      expect(screen.getByText(/more than subtotal/)).toBeInTheDocument();
      expect(completeButton()).toBeDisabled();
    });

    it("hides the discount field without the apply_discount permission", () => {
      setup({ canApplyDiscount: false });
      expect(screen.queryByLabelText("Discount (৳)")).not.toBeInTheDocument();
    });

    it("hides credit without the approve_credit_sale permission", () => {
      setup({ canSellOnCredit: false });
      expect(screen.queryByRole("button", { name: "Credit (baki)" })).not.toBeInTheDocument();
    });

    it("credit needs a customer before the sale can complete", async () => {
      const { user } = setup();
      await user.click(productButton("Paracetamol"));
      await user.click(screen.getByRole("button", { name: "Credit (baki)" }));

      expect(screen.getByText(/Choose a customer/)).toBeInTheDocument();
      expect(completeButton()).toBeDisabled();

      await user.selectOptions(screen.getByLabelText("Customer"), "9");
      expect(completeButton()).toBeEnabled();
    });
  });

  describe("completing a sale", () => {
    it("posts the bill, shows the receipt with change, and refreshes the page data", async () => {
      const fetchMock = mockFetch({
        ok: true,
        body: { ok: true, sale: { id: 41, receipt_number: "RCPT-123-2", total_amount: 11 } },
      });
      const { user } = setup();

      await user.click(productButton("Paracetamol"));
      await user.click(productButton("Paracetamol"));
      await user.click(productButton("Omeprazole"));
      await user.type(screen.getByLabelText("Discount (৳)"), "1");
      await user.type(screen.getByLabelText("Cash received (৳)"), "20");
      await user.click(completeButton());

      expect(fetchMock).toHaveBeenCalledWith("/api/sales", expect.objectContaining({ method: "POST" }));
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
        items: [
          { productId: 1, quantity: 2 },
          { productId: 2, quantity: 1 },
        ],
        paymentMethod: "cash",
        discountAmount: 1,
      });

      expect(await screen.findByRole("heading", { name: "Sale complete" })).toBeInTheDocument();
      expect(screen.getByText("RCPT-123-2")).toBeInTheDocument();
      expect(screen.getByText("Return change: ৳9.00")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /View \/ print receipt/ })).toHaveAttribute("href", "/sales/history/41");
      expect(refresh).toHaveBeenCalled();

      await user.click(screen.getByRole("button", { name: "New sale" }));
      expect(within(bill()).getByText("The bill is empty.")).toBeInTheDocument();
    });

    it("sends the customer id for a credit sale", async () => {
      const fetchMock = mockFetch({ ok: true, body: { sale: { id: 1, receipt_number: "R", total_amount: 2.5 } } });
      const { user } = setup();

      await user.click(productButton("Paracetamol"));
      await user.click(screen.getByRole("button", { name: "Credit (baki)" }));
      await user.selectOptions(screen.getByLabelText("Customer"), "9");
      await user.click(completeButton());

      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ paymentMethod: "credit", customerId: "9" });
    });

    it("shows the server's error and keeps the bill so the cashier can fix it", async () => {
      mockFetch({ ok: false, body: { error: "Insufficient stock for Omeprazole (need 3, have 1)" } });
      const { user } = setup();

      await user.click(productButton("Omeprazole"));
      await user.click(completeButton());

      expect(await screen.findByRole("alert")).toHaveTextContent("Insufficient stock for Omeprazole");
      expect(within(bill()).getByText("Omeprazole")).toBeInTheDocument();
      expect(refresh).not.toHaveBeenCalled();
    });

    it("handles the network being down", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
      const { user } = setup();

      await user.click(productButton("Paracetamol"));
      await user.click(completeButton());

      expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the server");
      expect(completeButton()).toBeEnabled();
    });

    it("can't be double-submitted while the request is in flight", async () => {
      let resolve!: (v: unknown) => void;
      const fetchMock = vi.fn().mockReturnValue(new Promise((r) => (resolve = r)));
      vi.stubGlobal("fetch", fetchMock);
      const { user } = setup();

      await user.click(productButton("Paracetamol"));
      await user.click(completeButton());
      expect(screen.getByRole("button", { name: "Completing sale…" })).toBeDisabled();
      await user.click(screen.getByRole("button", { name: "Completing sale…" }));

      expect(fetchMock).toHaveBeenCalledTimes(1);
      resolve({ ok: true, json: async () => ({ sale: { id: 1, receipt_number: "R", total_amount: 2.5 } }) });
      expect(await screen.findByRole("heading", { name: "Sale complete" })).toBeInTheDocument();
    });
  });
});
