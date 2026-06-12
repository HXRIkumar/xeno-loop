import { prisma } from "@/lib/prisma";
import {
  SegmentFilterSchema,
  buildCustomerWhere,
  previewSegment,
  type SegmentFilter,
} from "@/lib/segment";
import { renderMessage } from "@/lib/render";
import { sendBatchToChannel, wakeChannel, type ChannelSend } from "@/lib/channel";
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
  | { ok: false; code: "NOT_FOUND" | "NOT_FIREABLE" | "EMPTY_AUDIENCE" | "DISPATCH_FAILED" }
  | { ok: true; fired: number };

const COMM_SELECT = {
  id: true,
  customerId: true,
  channel: true,
  renderedMessage: true,
  status: true,
} as const;

/**
 * Fire a campaign — robust + idempotent / re-runnable.
 *
 * Fireable when APPROVED (first fire) or SENDING (resume a fire whose dispatch didn't complete —
 * e.g. the channel service was cold-starting). Communications are created ONCE: re-firing reuses
 * the existing rows, and only the still-QUEUED ones are dispatched, so a re-fire can't double-send.
 * The campaign is flipped to SENDING only AFTER the batch is accepted, so a failed dispatch leaves
 * it APPROVED with its rows intact — re-firing simply retries the dispatch (no dead SENDING/409 loop).
 */
export async function fireCampaign(campaignId: string): Promise<FireResult> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return { ok: false, code: "NOT_FOUND" };
  if (campaign.status !== "APPROVED" && campaign.status !== "SENDING") {
    return { ok: false, code: "NOT_FIREABLE" }; // PROPOSED must be approved; COMPLETED/FAILED are done
  }

  // Reuse communications from any prior fire attempt (idempotency — don't recreate / double-send).
  let comms = await prisma.communication.findMany({
    where: { campaignId: campaign.id },
    select: COMM_SELECT,
  });

  if (comms.length === 0) {
    // First fire: resolve the audience fresh from the stored filter and create the rows once.
    const filter = SegmentFilterSchema.parse(campaign.segmentSnapshotJson);
    const audience = await prisma.customer.findMany({
      where: buildCustomerWhere(filter),
      select: { id: true, name: true, persona: true },
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
    comms = await prisma.communication.createManyAndReturn({ data: rows, select: COMM_SELECT });
  }

  // Dispatch ONLY comms the channel hasn't processed yet (still QUEUED) — re-firing a partially
  // dispatched campaign won't re-send the ones already in flight / delivered.
  const pending = comms.filter((c) => c.status === "QUEUED");

  if (pending.length > 0) {
    const custIds = [...new Set(pending.map((c) => c.customerId))];
    const contacts = await prisma.customer.findMany({
      where: { id: { in: custIds } },
      select: { id: true, email: true, phone: true },
    });
    const byId = new Map(contacts.map((c) => [c.id, c]));
    const sends: ChannelSend[] = pending.map((comm) => {
      const c = byId.get(comm.customerId)!;
      return {
        communicationId: comm.id,
        recipient: comm.channel === "EMAIL" ? c.email : c.phone,
        message: comm.renderedMessage,
        channel: comm.channel,
      };
    });

    // wake a possibly-cold channel service, then dispatch resiliently. If it can't be reached, the
    // rows are already persisted and the campaign stays APPROVED → re-fire retries (no stuck state).
    const awake = await wakeChannel();
    if (!awake) return { ok: false, code: "DISPATCH_FAILED" };
    try {
      await sendBatchToChannel(sends);
    } catch {
      return { ok: false, code: "DISPATCH_FAILED" };
    }
  }

  // Dispatch accepted (or nothing left to send) → mark SENDING so the receipt loop can complete it.
  await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "SENDING" } });
  return { ok: true, fired: pending.length };
}

/** PROPOSED → APPROVED (the human-in-the-loop guardrail). */
export async function approveCampaign(campaignId: string): Promise<boolean> {
  const res = await prisma.campaign.updateMany({
    where: { id: campaignId, status: "PROPOSED" },
    data: { status: "APPROVED" },
  });
  return res.count > 0;
}
