/**
 * Learning Loop — DB fetch. The single source of truth behind BOTH the `get_campaign_learnings`
 * tool and the "What Loop learned" panel. Reuses analytics' `channelPerformance()` for the funnel
 * numbers (so they match the Analytics page exactly), adds per-channel campaign counts, and computes
 * a guarded persona×channel signal. Pure shaping lives in `learnings.ts`.
 */
import type { Persona, Channel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { channelPerformance } from "@/lib/analytics";
import { PERSONA_LABEL, CHANNEL_LABEL } from "@/lib/display";
import { computeLearnings, PERSONA_MIN_SENT, type CampaignLearnings, type PersonaSignal } from "@/lib/learnings";

// Campaigns that were actually fired (have real comms/events) — same filter analytics uses.
const FIRED = ["SENDING", "COMPLETED"] as const;

/**
 * Strongest persona×channel conversion signal across fired campaigns — or null unless a cell clears
 * the sample guard (PERSONA_MIN_SENT), so a thin cell is never surfaced as if it were solid.
 */
async function personaChannelSignal(): Promise<PersonaSignal | null> {
  const comms = await prisma.communication.findMany({
    where: { campaign: { status: { in: [...FIRED] } } },
    select: { channel: true, status: true, customer: { select: { persona: true } } },
  });

  const cells = new Map<string, { persona: Persona; channel: Channel; sent: number; converted: number }>();
  for (const c of comms) {
    const key = `${c.customer.persona}|${c.channel}`;
    const cell = cells.get(key) ?? { persona: c.customer.persona, channel: c.channel, sent: 0, converted: 0 };
    cell.sent += 1;
    if (c.status === "CONVERTED") cell.converted += 1;
    cells.set(key, cell);
  }

  let best: PersonaSignal | null = null;
  for (const cell of cells.values()) {
    if (cell.sent < PERSONA_MIN_SENT) continue; // too thin to claim
    const convertedPct = Math.round((cell.converted / cell.sent) * 100);
    if (convertedPct <= 0) continue; // don't surface a 0% "best"
    if (!best || convertedPct > best.convertedPct) {
      best = { persona: PERSONA_LABEL[cell.persona], channel: CHANNEL_LABEL[cell.channel], convertedPct, sent: cell.sent };
    }
  }
  return best;
}

/** The overall, grounded learnings summary. No args ⇒ comprehensive (per-channel + best/worst + persona). */
export async function getCampaignLearnings(): Promise<CampaignLearnings> {
  const [channelStats, campaignGroups, personaSignal] = await Promise.all([
    channelPerformance(),
    prisma.campaign.groupBy({ by: ["channel"], where: { status: { in: [...FIRED] } }, _count: true }),
    personaChannelSignal(),
  ]);

  const campaignsByChannel: Record<string, number> = {};
  for (const g of campaignGroups) campaignsByChannel[g.channel] = g._count;

  return computeLearnings(channelStats, campaignsByChannel, personaSignal, new Date().toISOString());
}
