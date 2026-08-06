import { redirect } from "next/navigation";
import { Warehouse } from "lucide-react";
import { getAuthContext } from "@/lib/wholesaler/request-context";
import { PageHeader } from "@/components/ui/page-header";
import { WholesalerCatalog } from "@/components/wholesaler/wholesaler-catalog";
import { CatalogHeaderActions } from "@/components/wholesaler/catalog-header-actions";

export default async function WholesalerCatalogPage() {
  const auth = await getAuthContext();
  if (auth.type === "public") {
    redirect("/wholesaler/login");
  }

  const label = auth.type === "wholesaler" ? auth.user.shopName : `${auth.user.name} (staff)`;

  return (
    <main className="min-h-full flex-1 bg-background p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader
          icon={Warehouse}
          title="Wholesale Catalog"
          description="Wholesale pricing and live stock — partner access only."
          action={<CatalogHeaderActions kind={auth.type} label={label} />}
        />
        <WholesalerCatalog canOrder={auth.type === "wholesaler"} />
      </div>
    </main>
  );
}
