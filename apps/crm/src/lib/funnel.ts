import { prisma } from "@/lib/prisma";
import { cumulativeFunnel, rate } from "@/lib/funnel-math";
import type { Channel, CampaignStatus } from "@prisma/client";

export type FunnelStage = {
  key: "sent" | "delivered" | "opened" | "read" | "clicked" | "converted";
  label: string;
  count: number;
  rateOfSent: number; // % of sent that reached this stage
};

export type CampaignFunnel = {
  campaign: {
    id: string;
    name: string;
    status: CampaignStatus;
    channel: Channel;
    audienceSize: number;
  };
  total: number; // communications created
  queued: number;
  failed: number;
  stages: FunnelStage[];
  attributedOrders: number;
  attributedRevenue: number;
};

/**
 * Compute the funnel for one campaign. Status is the FURTHEST stage a comm reached, so each
 * funnel level is the cumulative count at-or-beyond it. A FAILED comm WAS sent but never
 * delivered, so it counts toward "sent" only.
 */
export async function computeCampaignFunnel(campaignId: string): Promise<CampaignFunnel | null> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, name: true, status: true, channel: true, audienceSize: true },
  });
  if (!campaign) return null;

  const [grouped, attribution] = await Promise.all([
    prisma.communication.groupBy({ by: ["status"], where: { campaignId }, _count: true }),
    prisma.order.aggregate({
      where: { attributedCommunication: { campaignId } },
      _sum: { amount: true },
      _count: true,
    }),
  ]);

  const counts = Object.fromEntries(grouped.map((g) => [g.status, g._count]));
  const f = cumulativeFunnel(counts);

  const stages: FunnelStage[] = [
    { key: "sent", label: "Sent", count: f.sent, rateOfSent: 100 },
    { key: "delivered", label: "Delivered", count: f.delivered, rateOfSent: rate(f.delivered, f.sent) },
    { key: "opened", label: "Opened", count: f.opened, rateOfSent: rate(f.opened, f.sent) },
    { key: "read", label: "Read", count: f.read, rateOfSent: rate(f.read, f.sent) },
    { key: "clicked", label: "Clicked", count: f.clicked, rateOfSent: rate(f.clicked, f.sent) },
    { key: "converted", label: "Converted", count: f.converted, rateOfSent: rate(f.converted, f.sent) },
  ];

  return {
    campaign,
    total: f.total,
    queued: f.queued,
    failed: f.failed,
    stages,
    attributedOrders: attribution._count,
    attributedRevenue: attribution._sum.amount ?? 0,
  };
}
