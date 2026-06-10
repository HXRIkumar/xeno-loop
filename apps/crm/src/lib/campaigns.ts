import { prisma } from "@/lib/prisma";
import {
  SegmentFilterSchema,
  buildCustomerWhere,
  previewSegment,
  type SegmentFilter,
} from "@/lib/segment";
import { renderMessage } from "@/lib/render";
import { sendBatchToChannel, type ChannelSend } from "@/lib/channel";
import { PERSONA_LABEL } from "@/lib/display";
import type { Channel, Prisma } from "@prisma/client";

export type CreateCampaignInput = {
  name: string;
  goal: string;
  filter: SegmentFilter;
  messageTemplate: string;
  offer?: string | null;
  channel: Channel;
  expectedImpact?: Prisma.InputJsonValue;
  reasoning?: Prisma.InputJsonValue;
};

/** Create a campaign in PROPOSED state. Used by the manual form AND the agent's propose tool. */
export async function createCampaign(input: CreateCampaignInput) {
  const filter = SegmentFilterSchema.parse(input.filter);
  const { count } = await previewSegment(filter);

  return prisma.campaign.create({
    data: {
      name: input.name,
      goal: input.goal,
      segmentSnapshotJson: filter as Prisma.InputJsonValue,
      audienceSize: count,
      messageTemplate: input.messageTemplate,
      offer: input.offer ?? null,
      channel: input.channel,
      expectedImpactJson: input.expectedImpact ?? undefined,
      reasoningJson: input.reasoning ?? undefined,
      status: "PROPOSED",
    },
  });
}

export type FireResult =
  | { ok: false; code: "NOT_FOUND" | "NOT_APPROVED" | "EMPTY_AUDIENCE" }
  | { ok: true; fired: number };

/**
 * Fire an APPROVED campaign: resolve the audience fresh, render per-customer messages, persist
 * QUEUED Communications, flip the campaign to SENDING, and hand the batch to the channel service.
 * Guarded to APPROVED only, so it can't double-fire (firing sets SENDING).
 */
export async function fireCampaign(campaignId: string): Promise<FireResult> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return { ok: false, code: "NOT_FOUND" };
  if (campaign.status !== "APPROVED") return { ok: false, code: "NOT_APPROVED" };

  const filter = SegmentFilterSchema.parse(campaign.segmentSnapshotJson);
  const audience = await prisma.customer.findMany({
    where: buildCustomerWhere(filter),
    select: { id: true, name: true, persona: true, email: true, phone: true },
  });
  if (audience.length === 0) return { ok: false, code: "EMPTY_AUDIENCE" };

  const rows = audience.map((cust) => ({
    campaignId: campaign.id,
    customerId: cust.id,
    channel: campaign.channel,
    renderedMessage: renderMessage(campaign.messageTemplate, {
      name: cust.name,
      persona: PERSONA_LABEL[cust.persona],
      offer: campaign.offer,
    }),
  }));

  // create comms + flip status atomically, THEN dispatch (so a channel hiccup can't leave us
  // half-fired without rows)
  const created = await prisma.$transaction(async (tx) => {
    const comms = await tx.communication.createManyAndReturn({
      data: rows,
      select: { id: true, customerId: true, channel: true, renderedMessage: true },
    });
    await tx.campaign.update({ where: { id: campaign.id }, data: { status: "SENDING" } });
    return comms;
  });

  const byId = new Map(audience.map((c) => [c.id, c]));
  const sends: ChannelSend[] = created.map((comm) => {
    const cust = byId.get(comm.customerId)!;
    return {
      communicationId: comm.id,
      recipient: comm.channel === "EMAIL" ? cust.email : cust.phone,
      message: comm.renderedMessage,
      channel: comm.channel,
    };
  });

  await sendBatchToChannel(sends);
  return { ok: true, fired: sends.length };
}

/** PROPOSED → APPROVED (the human-in-the-loop guardrail). */
export async function approveCampaign(campaignId: string): Promise<boolean> {
  const res = await prisma.campaign.updateMany({
    where: { id: campaignId, status: "PROPOSED" },
    data: { status: "APPROVED" },
  });
  return res.count > 0;
}
