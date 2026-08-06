import type { Metadata } from "next";
import { Pill } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ShopCatalog } from "@/components/shop/shop-catalog";

export const metadata: Metadata = {
  title: "Shop — Bangla Medical Hall",
};

export default function ShopPage() {
  return (
    <main className="min-h-full flex-1 bg-background p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader icon={Pill} title="Shop" description="Browse products and current stock." />
        <ShopCatalog />
      </div>
    </main>
  );
}
