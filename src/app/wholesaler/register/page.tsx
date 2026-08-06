import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/wholesaler/request-context";
import { WholesalerAuthShell } from "@/components/wholesaler/auth-shell";
import { WholesalerRegisterForm } from "@/components/wholesaler/register-form";

export const metadata: Metadata = {
  title: "Wholesaler Registration — Pharmacy POS",
};

export default async function WholesalerRegisterPage() {
  const auth = await getAuthContext();
  if (auth.type !== "public") {
    redirect("/wholesaler/catalog");
  }

  return (
    <WholesalerAuthShell
      title="Create your wholesale account"
      subtitle="Register your shop to see wholesale pricing and stock"
    >
      <WholesalerRegisterForm />
    </WholesalerAuthShell>
  );
}
