/**
 * Dynamic opportunities — DB loader. Mirrors learnings-data.ts: it does the querying (reusing
 * previewSegment + the Campaign table — NOT forking them) and hands raw metrics + campaign signals
 * to the pure computeOpportunities(). Both the dashboard and GET /api/opportunities go through here.
 */
import { prisma } from "@/lib/prisma";
import { previewSegment, SegmentFilterSchema } from "@/lib/segment";
import {
  computeOpportunities,
  OPPORTUNITY_WINDOW_DAYS,
  type Opportunity,
  type OpportunityMetric,
  type OpportunityCampaignSignal,
} from "@/lib/opportunities";

// Tuneable thresholds (documented in BUILD-LOG.md). "High-spender" floor for the dormant win-back;
// inactivity for discount hunters; the order count that marks a customer brand-loyal.
const DORMANT_MIN_LTV = 10000;
const DISCOUNT_INACTIVE_DAYS = 45;
const LOYAL_MIN_ORDERS = 4;

const ACTED_STATUSES = ["APPROVED", "SENDING", "COMPLETED"] as const;
const DAY_MS = 86_400_000;

export async function getOpportunities(): Promise<Opportunity[]> {
  const windowStart = new Date(Date.now() - OPPORTUNITY_WINDOW_DAYS * DAY_MS);

  const [dormant, newOnce, hunters, loyal, highspenders, recentCampaigns] = await Promise.all([
    previewSegment({ personas: ["DORMANT"], minLtv: DORMANT_MIN_LTV }),
    previewSegment({ personas: ["NEW"], minOrders: 1, maxOrders: 1 }),
    previewSegment({ personas: ["DISCOUNT_HUNTER"], minDaysSinceOrder: DISCOUNT_INACTIVE_DAYS }),
    previewSegment({ personas: ["BRAND_LOYAL"], minOrders: LOYAL_MIN_ORDERS }),
    previewSegment({ personas: ["HIGH_SPENDER"] }),
    prisma.campaign.findMany({
      where: { status: { in: [...ACTED_STATUSES] }, createdAt: { gte: windowStart } },
      select: { segmentSnapshotJson: true, status: true, createdAt: true },
    }),
  ]);

  const metrics: OpportunityMetric[] = [
    { kind: "winback-dormant-highspenders", count: dormant.count, value: dormant.totalLtv },
    { kind: "convert-new-second-order", count: newOnce.count, value: newOnce.totalLtv },
    { kind: "reengage-discount-hunters", count: hunters.count, value: hunters.totalLtv },
    { kind: "reward-brand-loyal", count: loyal.count, value: loyal.totalLtv },
    { kind: "grow-high-spenders", count: highspenders.count, value: highspenders.totalLtv },
  ];

  const now = Date.now();
  const campaignSignals: OpportunityCampaignSignal[] = recentCampaigns.map((c) => {
    const parsed = SegmentFilterSchema.safeParse(c.segmentSnapshotJson);
    return {
      personas: parsed.success ? (parsed.data.personas ?? []) : [],
      status: c.status,
      ageDays: (now - c.createdAt.getTime()) / DAY_MS,
    };
  });

  return computeOpportunities(metrics, campaignSignals);
}
