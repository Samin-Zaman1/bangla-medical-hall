import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/** Blocks /api/setup/* in production unless x-setup-secret matches SETUP_SECRET. */
export function checkSetupAllowed(request: Request): NextResponse | null {
  if (process.env.NODE_ENV !== "production") return null;

  const secret = process.env.SETUP_SECRET;
  if (secret && request.headers.get("x-setup-secret") === secret) return null;

  return NextResponse.json(
    { error: "Setup endpoints are disabled in production" },
    { status: 403 },
  );
}

/** True once at least one app_user exists — first-run setup is only ever for account zero. */
export async function hasExistingUsers(): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase
    .from("app_user")
    .select("id", { count: "exact", head: true });

  if (error) throw error;
  return (count ?? 0) > 0;
}
