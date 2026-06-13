/**
 * The Learning Loop — PURE aggregation core (no DB imports), so it's unit-testable with fixtures
 * and safe to import for its types on the client. The DB fetch lives in `learnings-data.ts`; both
 * the `get_campaign_learnings` agent tool and the "What Loop learned" panel go through that single
 * source of truth — so the human sees exactly the numbers the agent grounded on.
 */
import { inr } from "@/lib/utils";

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
