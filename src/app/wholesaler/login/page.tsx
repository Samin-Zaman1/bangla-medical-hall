import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/wholesaler/request-context";
import { WholesalerAuthShell } from "@/components/wholesaler/auth-shell";
import { WholesalerLoginForm } from "@/components/wholesaler/login-form";

export const metadata: Metadata = {
  title: "Wholesaler Login — Bangla Medical Hall",
};

export default async function WholesalerLoginPage() {
  const auth = await getAuthContext();
  if (auth.type !== "public") {
    redirect("/wholesaler/catalog");
  }

  return (
    <WholesalerAuthShell
      title="Wholesale Partner Login"
      subtitle="Sign in to view live stock and wholesale pricing"
    >
      <WholesalerLoginForm />
    </WholesalerAuthShell>
  );
}
