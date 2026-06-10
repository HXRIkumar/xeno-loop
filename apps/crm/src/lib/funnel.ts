import { prisma } from "@/lib/prisma";
import type { Channel, CampaignStatus, CommStatus } from "@prisma/client";

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

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

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

  const c = (s: CommStatus) => grouped.find((g) => g.status === s)?._count ?? 0;
  const total = grouped.reduce((acc, g) => acc + g._count, 0);

  const converted = c("CONVERTED");
  const clicked = converted + c("CLICKED");
  const read = clicked + c("READ");
  const opened = read + c("OPENED");
  const delivered = opened + c("DELIVERED");
  const queued = c("QUEUED");
  const failed = c("FAILED");
  const sent = total - queued; // everything dispatched, including FAILED

  const stages: FunnelStage[] = [
    { key: "sent", label: "Sent", count: sent, rateOfSent: 100 },
    { key: "delivered", label: "Delivered", count: delivered, rateOfSent: pct(delivered, sent) },
    { key: "opened", label: "Opened", count: opened, rateOfSent: pct(opened, sent) },
    { key: "read", label: "Read", count: read, rateOfSent: pct(read, sent) },
    { key: "clicked", label: "Clicked", count: clicked, rateOfSent: pct(clicked, sent) },
    { key: "converted", label: "Converted", count: converted, rateOfSent: pct(converted, sent) },
  ];

  return {
    campaign,
    total,
    queued,
    failed,
    stages,
    attributedOrders: attribution._count,
    attributedRevenue: attribution._sum.amount ?? 0,
  };
}
