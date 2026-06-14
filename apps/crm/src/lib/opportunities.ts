/**
 * Dynamic dashboard opportunities — PURE core (no DB imports), so it's unit-testable with fixtures.
 * Mirrors the learnings.ts / learnings-data.ts split: this file shapes raw, DB-grounded metrics +
 * recent-campaign signals into the opportunity cards; the loader in `opportunities-data.ts` does the
 * querying (reusing previewSegment + the campaign table — it does NOT fork those helpers).
 *
 * Each opportunity is STATEFUL: its status is derived from real campaigns, so after the marketer
 * fires the matching campaign the card visibly flips open → in progress → addressed on reload.
 */
import { inr } from "@/lib/utils";

export type OpportunityStatus = "open" | "in_progress" | "addressed";

export type OpportunityKind =
  | "winback-dormant-highspenders"
  | "convert-new-second-order"
  | "reengage-discount-hunters"
  | "reward-brand-loyal"
  | "grow-high-spenders";

export type Opportunity = {
  id: OpportunityKind; // stable slug
  title: string;
  description: string; // grounded, cites the real number
  segmentLabel: string; // persona/segment this maps to
  metricPrimary: string; // e.g. "33 customers"
  metricSecondary: string; // e.g. "₹5,06,200 at risk"
  status: OpportunityStatus;
  suggestedPrompt: string; // exact text to prefill the agent on /loop
};

/** One DB-grounded metric per candidate kind (the loader includes only those with count > 0). */
export type OpportunityMetric = {
  kind: OpportunityKind;
  count: number;
  value: number; // secondary money metric in ₹ (totalLtv / combined first-order value / …)
};

/** A recent campaign reduced to what status-derivation needs (loader maps it from Campaign rows). */
export type OpportunityCampaignSignal = {
  personas: string[]; // personas the campaign targeted (parsed from segmentSnapshotJson)
  status: "PROPOSED" | "APPROVED" | "SENDING" | "COMPLETED" | "FAILED";
  ageDays: number; // days since the campaign was created
};

/** A campaign counts as "acting on" an opportunity only if it's recent and actually fired/approved. */
export const OPPORTUNITY_WINDOW_DAYS = 14;

type KindMeta = {
  persona: string; // the persona used to match recent campaigns to this opportunity
  segmentLabel: string;
  title: string;
  describe: (m: OpportunityMetric) => string;
  metricPrimary: (m: OpportunityMetric) => string;
  metricSecondary: (m: OpportunityMetric) => string;
  suggestedPrompt: string;
};

const KIND_META: Record<OpportunityKind, KindMeta> = {
  "winback-dormant-highspenders": {
    persona: "DORMANT",
    segmentLabel: "Dormant high-spenders",
    title: "Win back dormant high-spenders",
    describe: (m) =>
      `${m.count} high-LTV customers haven't ordered in a while — ${inr(m.value)} in lifetime value is at risk of churning for good.`,
    metricPrimary: (m) => `${m.count} customers`,
    metricSecondary: (m) => `${inr(m.value)} at risk`,
    suggestedPrompt: "Propose a win-back campaign for our dormant high-spenders. Show your reasoning.",
  },
  "convert-new-second-order": {
    persona: "NEW",
    segmentLabel: "New customers (1 order)",
    title: "Convert new customers to a 2nd purchase",
    describe: (m) =>
      `${m.count} customers have ordered exactly once — ${inr(m.value)} of first-order value. A second-purchase nudge is the cheapest way to lift retention.`,
    metricPrimary: (m) => `${m.count} customers`,
    metricSecondary: (m) => `${inr(m.value)} first-order value`,
    suggestedPrompt:
      "Propose a second-purchase nudge for our new customers who have ordered exactly once. Show your reasoning.",
  },
  "reengage-discount-hunters": {
    persona: "DISCOUNT_HUNTER",
    segmentLabel: "Discount hunters",
    title: "Re-engage discount hunters",
    describe: (m) =>
      `${m.count} discount-driven customers have gone quiet — ${inr(m.value)} in lifetime value. They respond to offers, so a sharp promo can pull them back.`,
    metricPrimary: (m) => `${m.count} customers`,
    metricSecondary: (m) => `${inr(m.value)} lifetime value`,
    suggestedPrompt:
      "Propose an offer-led re-engagement campaign for our discount hunters. Show your reasoning.",
  },
  "reward-brand-loyal": {
    persona: "BRAND_LOYAL",
    segmentLabel: "Brand-loyal customers",
    title: "Reward brand-loyal customers",
    describe: (m) =>
      `${m.count} brand-loyal customers order steadily — ${inr(m.value)} in lifetime value. A loyalty reward deepens the relationship and lifts repeat revenue.`,
    metricPrimary: (m) => `${m.count} customers`,
    metricSecondary: (m) => `${inr(m.value)} lifetime value`,
    suggestedPrompt: "Propose a loyalty reward campaign for our brand-loyal customers. Show your reasoning.",
  },
  "grow-high-spenders": {
    persona: "HIGH_SPENDER",
    segmentLabel: "High-spenders",
    title: "Grow revenue from high-spenders",
    describe: (m) =>
      `${m.count} high-spenders drive ${inr(m.value)} in lifetime value. An exclusive, premium offer is the way to grow your most valuable segment.`,
    metricPrimary: (m) => `${m.count} customers`,
    metricSecondary: (m) => `${inr(m.value)} lifetime value`,
    suggestedPrompt: "Propose a campaign to grow revenue from our high-spenders. Show your reasoning.",
  },
};

const STATUS_RANK: Record<OpportunityStatus, number> = { open: 0, in_progress: 1, addressed: 2 };

/**
 * Derive an opportunity's status from recent campaigns. A campaign "acts on" this opportunity only
 * if it's within OPPORTUNITY_WINDOW_DAYS, isn't PROPOSED or FAILED, and targeted this persona.
 *   COMPLETED → addressed · APPROVED/SENDING → in_progress · otherwise → open.
 */
function deriveStatus(persona: string, campaigns: OpportunityCampaignSignal[]): OpportunityStatus {
  const acting = campaigns.filter(
    (c) =>
      c.ageDays <= OPPORTUNITY_WINDOW_DAYS &&
      c.status !== "PROPOSED" &&
      c.status !== "FAILED" &&
      c.personas.includes(persona)
  );
  if (acting.some((c) => c.status === "COMPLETED")) return "addressed";
  if (acting.some((c) => c.status === "SENDING" || c.status === "APPROVED")) return "in_progress";
  return "open";
}

/**
 * Pure: shape DB-grounded metrics + recent-campaign signals into opportunity cards. Only candidates
 * with real data (count > 0) become cards; each gets a status derived from campaigns, and the list is
 * sorted open → in_progress → addressed (so actionable cards lead, addressed cards sink).
 */
export function computeOpportunities(
  metrics: OpportunityMetric[],
  campaigns: OpportunityCampaignSignal[]
): Opportunity[] {
  return metrics
    .filter((m) => m.count > 0)
    .map((m) => {
      const meta = KIND_META[m.kind];
      return {
        id: m.kind,
        title: meta.title,
        description: meta.describe(m),
        segmentLabel: meta.segmentLabel,
        metricPrimary: meta.metricPrimary(m),
        metricSecondary: meta.metricSecondary(m),
        status: deriveStatus(meta.persona, campaigns),
        suggestedPrompt: meta.suggestedPrompt,
      };
    })
    .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);
}
