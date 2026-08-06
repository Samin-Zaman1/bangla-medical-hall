import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requirePermission, isSessionUser } from "@/lib/auth/require-auth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const authResult = await requirePermission("log_incoming_stock");
  if (!isSessionUser(authResult)) return authResult;
  const session = authResult;

  const { id, itemId } = await params;
  const purchaseInvoiceId = Number(id);
  const itemIdNum = Number(itemId);
  if (!Number.isInteger(purchaseInvoiceId) || purchaseInvoiceId <= 0) {
    return NextResponse.json({ error: "A valid purchase invoice id is required" }, { status: 400 });
  }
  if (!Number.isInteger(itemIdNum) || itemIdNum <= 0) {
    return NextResponse.json({ error: "A valid item id is required" }, { status: 400 });
  }

  let body: { quantity?: unknown; unitCost?: unknown; productId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: purchaseInvoice, error: lookupError } = await supabase
    .from("purchase_invoice")
    .select("id, status")
    .eq("id", purchaseInvoiceId)
    .eq("branch_id", session.branchId)
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 });
  }
  if (!purchaseInvoice) {
    return NextResponse.json({ error: "Purchase invoice not found" }, { status: 404 });
  }
  if (purchaseInvoice.status !== "draft") {
    return NextResponse.json(
      { error: "Only draft purchase invoices can be edited" },
      { status: 409 },
    );
  }

  const updates: Record<string, unknown> = {};

  if (body.quantity !== undefined) {
    const quantity = Number(body.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return NextResponse.json({ error: "quantity must be a positive integer" }, { status: 400 });
    }
    updates.quantity = quantity;
  }

  if (body.unitCost !== undefined) {
    const unitCost = body.unitCost === null || body.unitCost === "" ? null : Number(body.unitCost);
    if (unitCost !== null && (!Number.isFinite(unitCost) || unitCost < 0)) {
      return NextResponse.json({ error: "unitCost must be a non-negative number" }, { status: 400 });
    }
    updates.unit_cost = unitCost;
  }

  if (body.productId !== undefined) {
    if (body.productId === null) {
      updates.product_id = null;
      updates.matched = false;
    } else {
      const productId = Number(body.productId);
      if (!Number.isInteger(productId) || productId <= 0) {
        return NextResponse.json({ error: "productId must be a valid id" }, { status: 400 });
      }
      updates.product_id = productId;
      updates.matched = true;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("purchase_invoice_item")
    .update(updates)
    .eq("id", itemIdNum)
    .eq("purchase_invoice_id", purchaseInvoiceId)
    .select("id, product_id, raw_extracted_name, quantity, unit_cost, matched")
    .maybeSingle();

  if (error) {
    const status = /foreign key/i.test(error.message) ? 400 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
  if (!data) {
    return NextResponse.json({ error: "Item not found on this purchase invoice" }, { status: 404 });
  }

  return NextResponse.json({ item: data });
}
