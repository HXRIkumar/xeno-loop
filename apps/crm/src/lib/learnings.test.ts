import { describe, it, expect } from "vitest";
import {
  computeLearnings,
  MIN_CONFIDENT_CAMPAIGNS,
  MIN_CONFIDENT_SENT,
  type ChannelStatInput,
} from "./learnings";

const NOW = "2026-06-13T00:00:00.000Z";

// A confident channel (>= MIN campaigns AND >= MIN sends) and a thin one.
const stat = (channel: string, sent: number, convertRate: number, attributedRevenue: number): ChannelStatInput => ({
  channel,
  sent,
  deliveredRate: 90,
  openRate: 60,
  clickRate: 20,
  convertRate,
  attributedRevenue,
});

describe("computeLearnings", () => {
  it("cold start: no fired channels → hasData false + friendly headline, no best/worst", () => {
    const out = computeLearnings([stat("WHATSAPP", 0, 0, 0)], {}, null, NOW);
    expect(out.hasData).toBe(false);
    expect(out.headline).toMatch(/no campaign history yet/i);
    expect(out.bestChannel).toBeNull();
    expect(out.worstChannel).toBeNull();
    expect(out.perChannel).toHaveLength(0);
    expect(out.generatedAt).toBe(NOW);
  });

  it("maps funnel rates, sorts by convertedPct, picks best + worst", () => {
    const out = computeLearnings(
      [stat("SMS", 80, 1, 4100), stat("RCS", 60, 4, 14800), stat("WHATSAPP", 50, 2, 6200)],
      { RCS: 3, WHATSAPP: 2, SMS: 2 },
      null,
      NOW
    );
    expect(out.hasData).toBe(true);
    expect(out.perChannel.map((c) => c.channel)).toEqual(["RCS", "WHATSAPP", "SMS"]); // sorted desc
    expect(out.perChannel[0]).toMatchObject({ channel: "RCS", convertedPct: 4, deliveredPct: 90, openedPct: 60, clickedPct: 20, attributedRevenue: 14800 });
    expect(out.bestChannel).toEqual({ channel: "RCS", convertedPct: 4, lowConfidence: false });
    expect(out.worstChannel).toEqual({ channel: "SMS", convertedPct: 1, lowConfidence: false });
    expect(out.headline).toContain("RCS");
    expect(out.headline).toContain("₹14,800");
  });

  it("flags low confidence on thin samples (too few campaigns OR too few sends)", () => {
    const out = computeLearnings(
      [
        stat("RCS", MIN_CONFIDENT_SENT, 5, 16500), // sent ok but campaigns below threshold
        stat("EMAIL", MIN_CONFIDENT_SENT - 1, 3, 1500), // sends below threshold
      ],
      { RCS: MIN_CONFIDENT_CAMPAIGNS - 1, EMAIL: 5 },
      null,
      NOW
    );
    const rcs = out.perChannel.find((c) => c.channel === "RCS")!;
    const email = out.perChannel.find((c) => c.channel === "EMAIL")!;
    expect(rcs.lowConfidence).toBe(true); // < MIN_CONFIDENT_CAMPAIGNS
    expect(email.lowConfidence).toBe(true); // < MIN_CONFIDENT_SENT
    expect(out.bestChannel?.lowConfidence).toBe(true);
    expect(out.headline).toMatch(/early signal|limited data/i); // softened, not over-claimed
  });

  it("includes a persona signal only when it cleared the sample guard", () => {
    const strong = computeLearnings([stat("RCS", 60, 4, 14800)], { RCS: 3 }, { persona: "Dormant", channel: "RCS", convertedPct: 6, sent: 40 }, NOW);
    expect(strong.topPersonaChannel).toEqual({ persona: "Dormant", channel: "RCS", convertedPct: 6, sent: 40 });
    expect(strong.headline).toContain("Dormant");

    const thin = computeLearnings([stat("RCS", 60, 4, 14800)], { RCS: 3 }, { persona: "New", channel: "RCS", convertedPct: 50, sent: 5 }, NOW);
    expect(thin.topPersonaChannel).toBeNull(); // sent 5 < PERSONA_MIN_SENT → dropped
  });
});
