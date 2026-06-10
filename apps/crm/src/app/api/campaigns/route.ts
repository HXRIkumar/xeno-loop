import { NextResponse } from "next/server";
import { z } from "zod";
import { createCampaign } from "@/lib/campaigns";
import { SegmentFilterSchema } from "@/lib/segment";

export const dynamic = "force-dynamic";

const Body = z.object({
  name: z.string().min(1).max(120),
  goal: z.string().min(1).max(300),
  filter: SegmentFilterSchema,
  messageTemplate: z.string().min(1).max(1000),
  offer: z.string().max(200).optional().nullable(),
  channel: z.enum(["WHATSAPP", "SMS", "EMAIL", "RCS"]),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation failed", issues: parsed.error.flatten() }, { status: 400 });
  }
  const campaign = await createCampaign(parsed.data);
  return NextResponse.json({ id: campaign.id, status: campaign.status }, { status: 201 });
}
