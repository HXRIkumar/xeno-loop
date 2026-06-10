import { NextResponse } from "next/server";
import { z } from "zod";
import { ingestReceipt } from "@/lib/receipts";

export const dynamic = "force-dynamic";

// The channel service posts one of these per lifecycle event. `type` is a lifecycle stage;
// `final` flags the last event of a communication's timeline.
const ReceiptSchema = z.object({
  communicationId: z.string().min(1),
  providerEventId: z.string().min(1),
  type: z.enum([
    "QUEUED",
    "SENT",
    "DELIVERED",
    "OPENED",
    "READ",
    "CLICKED",
    "CONVERTED",
    "FAILED",
  ]),
  occurredAt: z.coerce.date(),
  final: z.boolean().optional(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = ReceiptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const result = await ingestReceipt(parsed.data);

  if (!result.ok) {
    // Unknown communication — tell the channel service not to keep retrying.
    return NextResponse.json({ error: "unknown communication" }, { status: 404 });
  }

  return NextResponse.json(result, { status: 200 });
}
