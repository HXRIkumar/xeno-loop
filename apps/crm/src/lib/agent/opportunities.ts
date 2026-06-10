/**
 * Proactive opportunities for the dashboard. Computed DETERMINISTICALLY from the data (fast,
 * reliable, no LLM call on every page load) — each one carries a pre-filled prompt that hands the
 * actual proposal work to the Loop agent when the marketer clicks. So the dashboard surfaces the
 * opportunity; the agent reasons and proposes.
 */
import { previewSegment } from "@/lib/segment";
import { revenueSplit, channelPerformance } from "@/lib/analytics";
import { inr } from "@/lib/utils";

export type Opportunity = {
  id: string;
  title: string;
  description: string;
  metric: string;
  prompt: string; // sent to the agent when clicked
};

export async function getOpportunities(): Promise<Opportunity[]> {
  const [dormantHigh, lapsingHunters, newcomers, channels] = await Promise.all([
    previewSegment({ personas: ["DORMANT"], minDaysSinceOrder: 120, minLtv: 10000 }),
    previewSegment({ personas: ["DISCOUNT_HUNTER"], minDaysSinceOrder: 45 }),
    previewSegment({ personas: ["NEW"], maxDaysSinceOrder: 45 }),
    channelPerformance().catch(() => []),
  ]);

  const opportunities: Opportunity[] = [];
  const bestChannel = [...channels].filter((c) => c.sent > 0).sort((a, b) => b.convertRate - a.convertRate)[0];
  const channelHint = bestChannel
    ? ` Past data shows ${bestChannel.channel} converts best (${bestChannel.convertRate}% of sent), so consider that channel.`
    : "";

  if (dormantHigh.count > 0) {
    opportunities.push({
      id: "dormant-high-ltv",
      title: "Win back dormant high-spenders",
      description: `${dormantHigh.count} high-LTV customers haven't ordered in 120+ days — avg LTV ${inr(
        dormantHigh.avgLtv
      )}. A timely win-back could recover real revenue before they churn for good.`,
      metric: `${dormantHigh.count} customers · ${inr(dormantHigh.totalLtv)} at risk`,
      prompt: `Propose a win-back campaign for our dormant high-LTV customers (DORMANT persona, no order in 120+ days, LTV ≥ ₹10,000).${channelHint} Show your reasoning.`,
    });
  }

  if (lapsingHunters.count > 0) {
    opportunities.push({
      id: "lapsing-hunters",
      title: "Re-activate lapsing discount hunters",
      description: `${lapsingHunters.count} discount-driven customers haven't ordered in 45+ days. They respond to offers — a sharp promo can pull them back.`,
      metric: `${lapsingHunters.count} customers`,
      prompt: `Propose an offer-led re-activation campaign for discount-hunter customers who haven't ordered in 45+ days (DISCOUNT_HUNTER persona, minDaysSinceOrder 45).${channelHint} Show your reasoning.`,
    });
  }

  if (newcomers.count > 0) {
    opportunities.push({
      id: "new-second-order",
      title: "Convert new customers to a second order",
      description: `${newcomers.count} new customers joined in the last 45 days. Nudging a second purchase is the cheapest way to lift retention.`,
      metric: `${newcomers.count} new customers`,
      prompt: `Propose a second-order nudge campaign for our NEW customers (active within 45 days).${channelHint} Show your reasoning.`,
    });
  }

  return opportunities.slice(0, 3);
}
