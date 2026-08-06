import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { hashPassword } from "@/lib/auth/password";
import { createSessionToken, sessionCookieOptions } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { checkSetupAllowed, hasExistingUsers } from "@/lib/setup-guard";

export async function POST(request: Request) {
  const blocked = checkSetupAllowed(request);
  if (blocked) return blocked;

  try {
    if (await hasExistingUsers()) {
      return NextResponse.json(
        { error: "Setup already completed. Please log in instead." },
        { status: 409 },
      );
    }

    const supabase = getSupabaseAdmin();
    const body = await request.json().catch(() => ({}));

    const branchName = String(body?.branchName ?? "Main Pharmacy").trim() || "Main Pharmacy";
    const address = String(body?.address ?? "Main Branch").trim() || null;
    const ownerName = String(body?.ownerName ?? "Owner").trim() || "Owner";
    const pin = String(body?.pin ?? "").trim();

    if (!/^\d{4,6}$/.test(pin)) {
      return NextResponse.json(
        { error: "PIN must be 4-6 digits" },
        { status: 400 },
      );
    }

    const { data: existingBranch, error: branchLookupError } = await supabase
      .from("branch")
      .select("id")
      .eq("name", branchName)
      .maybeSingle();

    if (branchLookupError) {
      throw branchLookupError;
    }

    let branchId = existingBranch?.id;
    if (!branchId) {
      const { data: insertedBranch, error: branchInsertError } = await supabase
        .from("branch")
        .insert({ name: branchName, address })
        .select("id")
        .single();

      if (branchInsertError || !insertedBranch) {
        throw branchInsertError ?? new Error("Could not create branch");
      }

      branchId = insertedBranch.id;
    }

    const pinHash = await hashPassword(pin);

    const { data: insertedUser, error: userInsertError } = await supabase
      .from("app_user")
      .insert({
        branch_id: branchId,
        name: ownerName,
        role: "owner",
        pin_hash: pinHash,
      })
      .select("id")
      .single();

    if (userInsertError || !insertedUser) {
      throw userInsertError ?? new Error("Could not create owner user");
    }

    const sessionUser = {
      id: insertedUser.id as number,
      branchId: branchId as number,
      name: ownerName,
      role: "owner" as const,
    };

    const token = await createSessionToken(sessionUser);
    const cookieStore = await cookies();
    cookieStore.set(sessionCookieOptions(token));

    return NextResponse.json({ ok: true, user: sessionUser });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Seed failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
