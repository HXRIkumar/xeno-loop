/**
 * Attribution + analytics rollups (last-touch within ATTRIBUTION_WINDOW_DAYS). Powers the
 * /analytics charts AND /api/insights (the agent's learning-loop input). The channel rollup is
 * the headline: because the channel sim is channel-differentiated, the convert-rate and
 * attributed-revenue differences are REAL, so "WhatsApp beat SMS for dormant high-LTV" is a fact
 * the agent can read back.
 */
import { prisma } from "@/lib/prisma";
import { cumulativeFunnel, funnelRates, rate, type StatusCounts } from "@/lib/funnel-math";
import { CHANNELS, PERSONAS } from "@/lib/display";
import type { Channel, Persona } from "@prisma/client";

export type ChannelStat = {
  channel: Channel;
  sent: number;
  delivered: number;
  opened: number;
  read: number;
  clicked: number;
  converted: number;
  deliveredRate: number;
  openRate: number;
  clickRate: number;
  convertRate: number; // of sent
  attributedOrders: number;
  attributedRevenue: number;
};

/** Per-channel funnel + attributed revenue. */
export async function channelPerformance(): Promise<ChannelStat[]> {
  const [byChannelStatus, attributedOrders] = await Promise.all([
    prisma.communication.groupBy({ by: ["channel", "status"], _count: true }),
    // attributed orders carry the communication's channel via the relation
    prisma.order.findMany({
      where: { attributedCommunicationId: { not: null } },
      select: { amount: true, attributedCommunication: { select: { channel: true } } },
    }),
  ]);

  const revByChannel = new Map<Channel, { orders: number; revenue: number }>();
  for (const o of attributedOrders) {
    const ch = o.attributedCommunication?.channel;
    if (!ch) continue;
    const cur = revByChannel.get(ch) ?? { orders: 0, revenue: 0 };
    cur.orders += 1;
    cur.revenue += o.amount;
    revByChannel.set(ch, cur);
  }

  return CHANNELS.map((channel) => {
    const counts: StatusCounts = {};
    for (const row of byChannelStatus) {
      if (row.channel === channel) counts[row.status] = row._count;
    }
    const f = cumulativeFunnel(counts);
    const r = funnelRates(f);
    const rev = revByChannel.get(channel) ?? { orders: 0, revenue: 0 };
    return {
      channel,
      sent: f.sent,
      delivered: f.delivered,
      opened: f.opened,
      read: f.read,
      clicked: f.clicked,
      converted: f.converted,
      deliveredRate: r.deliveredRate,
      openRate: r.openRate,
      clickRate: r.clickRate,
      convertRate: r.convertRate,
      attributedOrders: rev.orders,
      attributedRevenue: rev.revenue,
    };
  });
}

/** Overall funnel across every communication ever sent. */
export async function overallFunnel() {
  const grouped = await prisma.communication.groupBy({ by: ["status"], _count: true });
  const counts: StatusCounts = Object.fromEntries(grouped.map((g) => [g.status, g._count]));
  const f = cumulativeFunnel(counts);
  return { ...f, rates: funnelRates(f) };
}

export type PersonaStat = { persona: Persona; customers: number; totalLtv: number };

export async function personaDistribution(): Promise<PersonaStat[]> {
  const grouped = await prisma.customer.groupBy({
    by: ["persona"],
    _count: true,
    _sum: { ltv: true },
  });
  const byPersona = new Map(grouped.map((g) => [g.persona, g]));
  return PERSONAS.map((persona) => ({
    persona,
    customers: byPersona.get(persona)?._count ?? 0,
    totalLtv: byPersona.get(persona)?._sum.ltv ?? 0,
  }));
}

/** Attributed (campaign-driven) vs organic revenue across all orders. */
export async function revenueSplit() {
  const [attributed, organic] = await Promise.all([
    prisma.order.aggregate({
      where: { attributedCommunicationId: { not: null } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.order.aggregate({
      where: { attributedCommunicationId: null },
      _sum: { amount: true },
      _count: true,
    }),
  ]);
  const attributedRevenue = attributed._sum.amount ?? 0;
  const organicRevenue = organic._sum.amount ?? 0;
  return {
    attributedRevenue,
    organicRevenue,
    totalRevenue: attributedRevenue + organicRevenue,
    attributedOrders: attributed._count,
    organicOrders: organic._count,
    attributedShare: rate(attributedRevenue, attributedRevenue + organicRevenue),
  };
}

/** Monthly revenue (last 12 months), attributed vs organic — the learning-loop time series. */
export async function revenueByMonth() {
  const since = new Date();
  since.setMonth(since.getMonth() - 11);
  since.setDate(1);
  since.setHours(0, 0, 0, 0);

  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: since } },
    select: { amount: true, createdAt: true, attributedCommunicationId: true },
  });

  const buckets = new Map<string, { attributed: number; organic: number }>();
  for (let i = 0; i < 12; i++) {
    const d = new Date(since);
    d.setMonth(since.getMonth() + i);
    buckets.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, {
      attributed: 0,
      organic: 0,
    });
  }
  for (const o of orders) {
    const key = `${o.createdAt.getFullYear()}-${String(o.createdAt.getMonth() + 1).padStart(2, "0")}`;
    const b = buckets.get(key);
    if (!b) continue;
    if (o.attributedCommunicationId) b.attributed += o.amount;
    else b.organic += o.amount;
  }
  return Array.from(buckets.entries()).map(([month, v]) => ({ month, ...v }));
}

export type CampaignStat = {
  id: string;
  name: string;
  channel: Channel;
  status: string;
  sent: number;
  convertRate: number;
  attributedRevenue: number;
};

/** Per-campaign rollup for the insights feed and analytics table. */
export async function campaignPerformance(): Promise<CampaignStat[]> {
  const campaigns = await prisma.campaign.findMany({
    where: { status: { in: ["SENDING", "COMPLETED"] } },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, channel: true, status: true },
  });
  if (campaigns.length === 0) return [];

  const [byCampaignStatus, attributed] = await Promise.all([
    prisma.communication.groupBy({
      by: ["campaignId", "status"],
      where: { campaignId: { in: campaigns.map((c) => c.id) } },
      _count: true,
    }),
    prisma.order.findMany({
      where: { attributedCommunication: { campaignId: { in: campaigns.map((c) => c.id) } } },
      select: { amount: true, attributedCommunication: { select: { campaignId: true } } },
    }),
  ]);

  const revByCampaign = new Map<string, number>();
  for (const o of attributed) {
    const cid = o.attributedCommunication?.campaignId;
    if (!cid) continue;
    revByCampaign.set(cid, (revByCampaign.get(cid) ?? 0) + o.amount);
  }

  return campaigns.map((c) => {
    const counts: StatusCounts = {};
    for (const row of byCampaignStatus) {
      if (row.campaignId === c.id) counts[row.status] = row._count;
    }
    const f = cumulativeFunnel(counts);
    return {
      id: c.id,
      name: c.name,
      channel: c.channel,
      status: c.status,
      sent: f.sent,
      convertRate: rate(f.converted, f.sent),
      attributedRevenue: revByCampaign.get(c.id) ?? 0,
    };
  });
}

/** Everything the /analytics page and the agent's get_past_performance tool need. */
export async function getInsights() {
  const [channels, funnel, personas, revenue, campaigns, monthly] = await Promise.all([
    channelPerformance(),
    overallFunnel(),
    personaDistribution(),
    revenueSplit(),
    campaignPerformance(),
    revenueByMonth(),
  ]);

  // a plain-language nudge for the agent's learning loop
  const channelsWithSends = channels.filter((c) => c.sent > 0);
  const best =
    channelsWithSends.length > 0
      ? [...channelsWithSends].sort((a, b) => b.convertRate - a.convertRate)[0]
      : null;

  return {
    channels,
    funnel,
    personas,
    revenue,
    campaigns,
    monthly,
    headline: best
      ? `${best.channel} has the best convert rate so far (${best.convertRate}% of sent, ${
          best.attributedRevenue
        } attributed).`
      : "No campaigns have been fired yet — no channel performance data to learn from.",
  };
}
