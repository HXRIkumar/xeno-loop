/**
 * The Learning Loop — PURE aggregation core (no DB imports), so it's unit-testable with fixtures
 * and safe to import for its types on the client. The DB fetch lives in `learnings-data.ts`; both
 * the `get_campaign_learnings` agent tool and the "What Loop learned" panel go through that single
 * source of truth — so the human sees exactly the numbers the agent grounded on.
 */
import type { Channel, Persona } from "@prisma/client";
import { inr } from "@/lib/utils";
import { CHANNEL_LABEL, PERSONA_LABEL } from "@/lib/display";

// A channel stays "low confidence" until it has enough campaigns AND enough sends to trust.
export const MIN_CONFIDENT_CAMPAIGNS = 2;
export const MIN_CONFIDENT_SENT = 30;
// A persona×channel cell needs at least this many sends before we'll surface it (else it's noise).
export const PERSONA_MIN_SENT = 20;

export type ChannelLearning = {
  channel: string;
  campaigns: number;
  sent: number;
  deliveredPct: number;
  openedPct: number;
  clickedPct: number;
  convertedPct: number;
  attributedRevenue: number;
  lowConfidence: boolean;
};

export type PersonaSignal = { persona: string; channel: string; convertedPct: number; sent: number };

export type CampaignLearnings = {
  hasData: boolean; // false ⇒ cold start (no campaigns fired yet)
  headline: string; // grounded, machine-generated — used by both the agent and the panel
  perChannel: ChannelLearning[];
  bestChannel: { channel: string; convertedPct: number; lowConfidence: boolean } | null;
  worstChannel: { channel: string; convertedPct: number; lowConfidence: boolean } | null;
  topPersonaChannel: PersonaSignal | null; // strongest persona×channel signal, or null if too thin
  generatedAt: string; // ISO
};

/** The per-channel funnel stats this needs — a structural subset of analytics' ChannelStat. */
export type ChannelStatInput = {
  channel: string;
  sent: number;
  deliveredRate: number;
  openRate: number;
  clickRate: number;
  convertRate: number;
  attributedRevenue: number;
};

function headlineFor(best: ChannelLearning | null, persona: PersonaSignal | null): string {
  if (!best) return "No campaign history yet — this is your first proposal.";
  const camps = best.campaigns === 1 ? "1 campaign" : `${best.campaigns} campaigns`;
  const core = best.lowConfidence
    ? `Early signal: ${best.channel} is converting best so far (${best.convertedPct}% of sent, ${inr(
        best.attributedRevenue
      )} across ${camps}) — limited data.`
    : `${best.channel} has the best conversion so far (${best.convertedPct}% of sent, ${inr(
        best.attributedRevenue
      )} attributed across ${camps}).`;
  const personaBit = persona ? ` ${persona.persona} convert best on ${persona.channel} (${persona.convertedPct}%).` : "";
  return core + personaBit;
}

/**
 * Pure: shape per-channel funnel stats + campaign counts (+ an optional, already-guarded persona
 * signal) into the grounded learnings summary. `nowIso` is injected so this is deterministic in tests.
 */
export function computeLearnings(
  channelStats: ChannelStatInput[],
  campaignsByChannel: Record<string, number>,
  personaSignal: PersonaSignal | null,
  nowIso: string
): CampaignLearnings {
  const perChannel: ChannelLearning[] = channelStats
    .filter((c) => c.sent > 0) // only channels with real, fired activity
    .map((c) => {
      const campaigns = campaignsByChannel[c.channel] ?? 0;
      return {
        channel: c.channel,
        campaigns,
        sent: c.sent,
        deliveredPct: c.deliveredRate,
        openedPct: c.openRate,
        clickedPct: c.clickRate,
        convertedPct: c.convertRate,
        attributedRevenue: c.attributedRevenue,
        lowConfidence: campaigns < MIN_CONFIDENT_CAMPAIGNS || c.sent < MIN_CONFIDENT_SENT,
      };
    })
    .sort((a, b) => b.convertedPct - a.convertedPct);

  const hasData = perChannel.length > 0;
  const best = hasData ? perChannel[0] : null;
  const worst = hasData ? perChannel[perChannel.length - 1] : null;
  const topPersonaChannel = personaSignal && personaSignal.sent >= PERSONA_MIN_SENT ? personaSignal : null;

  return {
    hasData,
    headline: headlineFor(best, topPersonaChannel),
    perChannel,
    bestChannel: best ? { channel: best.channel, convertedPct: best.convertedPct, lowConfidence: best.lowConfidence } : null,
    worstChannel: worst
      ? { channel: worst.channel, convertedPct: worst.convertedPct, lowConfidence: worst.lowConfidence }
      : null,
    topPersonaChannel,
    generatedAt: nowIso,
  };
}

// ------------------------------------------------------------------------------------------------
// Channel recommendation (Feature 2) — PURE. Surfaces the learnings model as a single, confidence-
// aware channel pick for the manual builder. Reuses the existing CampaignLearnings shape verbatim —
// no new aggregation, no re-query. The one wrinkle it bridges: bestChannel/perChannel carry the
// Channel ENUM, while topPersonaChannel carries display LABELS (Feature 1's choice) — so we map the
// persona-signal label back to the enum here, and always RETURN an enum the builder can select.
// ------------------------------------------------------------------------------------------------

export type ChannelRecommendation = {
  channel: Channel | null; // enum, ready to set in the builder; null ONLY on true cold-start
  reason: string; // grounded, human-readable — cites the real numbers
  confidence: "high" | "low" | "none";
  basis: "persona" | "overall" | "cold-start";
};

// label → enum, derived from the single label map (so it can't drift from display).
const CHANNEL_BY_LABEL: Record<string, Channel> = Object.fromEntries(
  (Object.entries(CHANNEL_LABEL) as [Channel, string][]).map(([enumValue, label]) => [label, enumValue])
) as Record<string, Channel>;

/**
 * Pure: turn the learnings model into one confidence-aware channel recommendation.
 *  - cold start (no fired data) → null channel + honest "Loop will learn" reason (never a fake pick)
 *  - persona path: ONLY when a single persona is selected AND the grounded persona×channel signal is
 *    for that persona — confidence from its sample size (the signal already cleared PERSONA_MIN_SENT)
 *  - otherwise: the overall best channel, confidence from its lowConfidence flag, reason enriched with
 *    attributed revenue + sample size from the matching per-channel row.
 */
export function recommendChannel(
  learnings: CampaignLearnings,
  opts?: { persona?: Persona }
): ChannelRecommendation {
  if (!learnings.hasData || !learnings.bestChannel) {
    return {
      channel: null,
      confidence: "none",
      basis: "cold-start",
      reason: "No past data yet — Loop will learn from this campaign.",
    };
  }

  // Persona-preferred channel — only if the grounded signal is for the (single) selected persona.
  const persona = opts?.persona;
  const tpc = learnings.topPersonaChannel;
  if (persona && tpc && tpc.persona === PERSONA_LABEL[persona]) {
    const channel = CHANNEL_BY_LABEL[tpc.channel] ?? null;
    if (channel) {
      const confident = tpc.sent >= MIN_CONFIDENT_SENT;
      const who = PERSONA_LABEL[persona];
      const reason = confident
        ? `For ${who} customers, ${tpc.channel} has converted best — ${tpc.convertedPct}% across ${tpc.sent} sends.`
        : `Early signal: ${who} customers convert best on ${tpc.channel} so far (${tpc.convertedPct}%, ${tpc.sent} sends) — limited data.`;
      return { channel, confidence: confident ? "high" : "low", basis: "persona", reason };
    }
  }

  // Overall best channel (default + persona fallback). bestChannel.channel is already an enum value.
  const best = learnings.bestChannel;
  const channel = best.channel as Channel;
  const label = CHANNEL_LABEL[channel] ?? best.channel;
  const row = learnings.perChannel.find((c) => c.channel === best.channel);
  const reason = best.lowConfidence
    ? `Early signal: ${label} is converting best so far (${best.convertedPct}%) — limited data.`
    : `${label} has the best conversion so far — ${best.convertedPct}% of sent${
        row
          ? `, ${inr(row.attributedRevenue)} attributed across ${row.campaigns} campaign${row.campaigns === 1 ? "" : "s"}`
          : ""
      }.`;
  return { channel, confidence: best.lowConfidence ? "low" : "high", basis: "overall", reason };
}
