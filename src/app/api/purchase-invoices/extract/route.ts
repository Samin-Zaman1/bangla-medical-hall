import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getAnthropicClient } from "@/lib/anthropic/server";
import { requirePermission, isSessionUser } from "@/lib/auth/require-auth";

// Same permission as the other "staff is recording incoming stock" write routes
// (src/app/api/purchases/route.ts, src/app/api/batches/route.ts).
const REQUIRED_PERMISSION = "log_incoming_stock" as const;

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type AcceptedImageType = (typeof ACCEPTED_IMAGE_TYPES)[number];

const EXTRACTION_PROMPT =
  'Extract every line item from this invoice/receipt image. Return ONLY a JSON array of ' +
  'objects — no prose, no explanation, and no markdown code fences. The response must start ' +
  'with "[" and end with "]". Each object must have exactly these fields: ' +
  '"raw_extracted_name" (string, the item name/description as printed), "quantity" (number), ' +
  'and "unit_cost" (number, the per-unit cost — use 0 if not printed on the invoice). ' +
  "If you cannot read the image or find no line items, return an empty array [].";

type ExtractedItem = { raw_extracted_name: string; quantity: number; unit_cost: number | null };

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

// Never throws — OCR output is untrusted and often malformed. Anything that doesn't parse
// cleanly into the expected shape is dropped rather than crashing the request; the caller
// still ends up with a draft purchase_invoice row (and the uploaded image) even if this
// returns an empty array.
function parseExtractedItems(rawText: string): ExtractedItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(rawText));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const items: ExtractedItem[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;

    const name = String(record.raw_extracted_name ?? "").trim();
    if (!name) continue;

    const quantityRaw = Number(record.quantity);
    const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? Math.round(quantityRaw) : 0;

    const unitCostRaw = Number(record.unit_cost);
    const unit_cost = Number.isFinite(unitCostRaw) ? unitCostRaw : null;

    items.push({ raw_extracted_name: name, quantity, unit_cost });
  }
  return items;
}

export async function POST(request: Request) {
  const authResult = await requirePermission(REQUIRED_PERMISSION);
  if (!isSessionUser(authResult)) return authResult;
  const session = authResult;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data with an image field" }, { status: 400 });
  }

  const file = formData.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "An image file is required" }, { status: 400 });
  }
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type as AcceptedImageType)) {
    return NextResponse.json(
      { error: `Unsupported image type "${file.type}". Accepted: ${ACCEPTED_IMAGE_TYPES.join(", ")}` },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const extension = file.type.split("/")[1];
  const storagePath = `${session.branchId}/${Date.now()}-${randomUUID()}.${extension}`;

  const supabase = getSupabaseAdmin();

  const { error: uploadError } = await supabase.storage
    .from("invoice-images")
    .upload(storagePath, buffer, { contentType: file.type, upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // Create the draft row before calling Claude — if OCR fails or the API is unreachable, the
  // photo and the draft record still exist so staff don't have to re-upload; extraction can be
  // retried against this row later.
  const { data: purchaseInvoice, error: insertError } = await supabase
    .from("purchase_invoice")
    .insert({
      branch_id: session.branchId,
      invoice_image_url: storagePath,
      status: "draft",
      created_by: session.id,
    })
    .select("id, invoice_image_url")
    .single();

  if (insertError || !purchaseInvoice) {
    return NextResponse.json({ error: insertError?.message ?? "Could not create purchase invoice" }, { status: 500 });
  }

  let extractedItems: ExtractedItem[] = [];
  let extractionError: string | null = null;

  try {
    const anthropic = getAnthropicClient();
    const response = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 4096,
      output_config: { effort: "low" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: file.type as AcceptedImageType, data: buffer.toString("base64") },
            },
            { type: "text", text: EXTRACTION_PROMPT },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      extractionError = "Claude declined to process this image";
    } else {
      const textBlock = response.content.find((block) => block.type === "text");
      extractedItems = textBlock ? parseExtractedItems(textBlock.text) : [];
    }
  } catch (error) {
    extractionError = error instanceof Error ? error.message : "Extraction request failed";
  }

  if (extractedItems.length > 0) {
    const { error: itemsError } = await supabase.from("purchase_invoice_item").insert(
      extractedItems.map((item) => ({
        purchase_invoice_id: purchaseInvoice.id,
        product_id: null,
        raw_extracted_name: item.raw_extracted_name,
        quantity: item.quantity,
        unit_cost: item.unit_cost,
        matched: false,
      })),
    );

    if (itemsError) {
      return NextResponse.json(
        {
          ok: true,
          purchaseInvoice,
          itemsExtracted: 0,
          warning: `Extracted ${extractedItems.length} line(s) but could not save them: ${itemsError.message}`,
        },
        { status: 207 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    purchaseInvoice,
    itemsExtracted: extractedItems.length,
    ...(extractionError ? { warning: extractionError } : {}),
  });
}
