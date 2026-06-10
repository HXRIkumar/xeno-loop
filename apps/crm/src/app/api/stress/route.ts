import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { CHANNELS } from "@/lib/display";

export const dynamic = "force-dynamic";

const Body = z.object({ count: z.coerce.number().int().min(1).max(5000).default(100) });

/**
 * Provision a synthetic "Stress Test" campaign with N real Communication rows spanning all four
 * channels (round-robin), then return them as send jobs. The channel service drains these
 * through the genuine queue→worker→receipt loop, so the stress test proves volume END TO END:
 * the funnel and channel analytics actually move. Used by the dashboard's Stress button and as
 * the Phase 2 verification harness.
 */
export async function POST(req: Request) {
  const body = Body.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json({ error: "validation failed" }, { status: 400 });
  }
  const { count } = body.data;

  // round-robin a pool of real customers so recipients are realistic
  const customers = await prisma.customer.findMany({
    select: { id: true, name: true, persona: true, email: true, phone: true },
    take: Math.min(count, 1000),
    orderBy: { createdAt: "asc" },
  });
  if (customers.length === 0) {
    return NextResponse.json({ error: "no customers seeded" }, { status: 409 });
  }

  const campaign = await prisma.campaign.create({
    data: {
      name: `Stress Test — ${count}`,
      goal: "Prove the delivery pipeline absorbs volume end to end.",
      segmentSnapshotJson: { type: "stress", count },
      audienceSize: count,
      messageTemplate: "Hi {name}, StyleArc just dropped something for you 👀",
      channel: "WHATSAPP",
      status: "SENDING",
    },
  });

  const rows = Array.from({ length: count }, (_, i) => {
    const c = customers[i % customers.length];
    const channel = CHANNELS[i % CHANNELS.length];
    return {
      campaignId: campaign.id,
      customerId: c.id,
      channel,
      renderedMessage: `Hi ${c.name.split(" ")[0]}, StyleArc just dropped something for you 👀`,
    };
  });

  const created = await prisma.communication.createManyAndReturn({
    data: rows,
    select: { id: true, customerId: true, channel: true, renderedMessage: true },
  });

  // attach recipient handle for the (simulated) channel
  const byId = new Map(customers.map((c) => [c.id, c]));
  const sends = created.map((comm) => {
    const c = byId.get(comm.customerId)!;
    return {
      communicationId: comm.id,
      recipient: comm.channel === "EMAIL" ? c.email : c.phone,
      message: comm.renderedMessage,
      channel: comm.channel,
    };
  });

  return NextResponse.json({ campaignId: campaign.id, count: sends.length, sends }, { status: 201 });
}
