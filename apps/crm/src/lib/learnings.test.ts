import { describe, it, expect } from "vitest";
import {
  computeLearnings,
  recommendChannel,
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

describe("recommendChannel", () => {
  it("cold start: no fired data → null channel, none confidence, honest reason (no fake pick)", () => {
    const rec = recommendChannel(computeLearnings([stat("WHATSAPP", 0, 0, 0)], {}, null, NOW));
    expect(rec.channel).toBeNull();
    expect(rec.confidence).toBe("none");
    expect(rec.basis).toBe("cold-start");
    expect(rec.reason).toMatch(/no past data/i);
  });

  it("overall best (confident) → enum channel + reason citing the real % and revenue", () => {
    const learnings = computeLearnings(
      [stat("SMS", 80, 1, 4100), stat("RCS", 60, 4, 14800)],
      { RCS: 3, SMS: 2 },
      null,
      NOW
    );
    const rec = recommendChannel(learnings);
    expect(rec.channel).toBe("RCS"); // enum value, ready to set in the builder
    expect(rec.basis).toBe("overall");
    expect(rec.confidence).toBe("high");
    expect(rec.reason).toContain("RCS");
    expect(rec.reason).toContain("4%");
    expect(rec.reason).toContain("₹14,800");
  });

  it("overall best on a thin sample → low confidence + 'limited data' phrasing", () => {
    const learnings = computeLearnings(
      [stat("RCS", MIN_CONFIDENT_SENT, 5, 16500)], // enough sends but only 1 campaign → low confidence
      { RCS: MIN_CONFIDENT_CAMPAIGNS - 1 },
      null,
      NOW
    );
    const rec = recommendChannel(learnings);
    expect(rec.channel).toBe("RCS");
    expect(rec.confidence).toBe("low");
    expect(rec.reason).toMatch(/early signal|limited data/i);
  });

  it("persona path: a single matching persona with a grounded signal overrides the overall best", () => {
    // Overall best is WHATSAPP, but Dormant convert best on RCS (grounded, sent ≥ MIN_CONFIDENT_SENT).
    const learnings = computeLearnings(
      [stat("WHATSAPP", 90, 5, 20000), stat("RCS", 60, 3, 9000)],
      { WHATSAPP: 3, RCS: 3 },
      { persona: "Dormant", channel: "RCS", convertedPct: 7, sent: 40 },
      NOW
    );
    expect(recommendChannel(learnings).channel).toBe("WHATSAPP"); // no persona → overall best

    const rec = recommendChannel(learnings, { persona: "DORMANT" });
    expect(rec.channel).toBe("RCS"); // persona signal wins; label "RCS" mapped back to the enum
    expect(rec.basis).toBe("persona");
    expect(rec.confidence).toBe("high"); // sent 40 ≥ MIN_CONFIDENT_SENT
    expect(rec.reason).toContain("Dormant");
    expect(rec.reason).toContain("RCS");
    expect(rec.reason).toContain("7%");
  });

  it("persona path ignored when the selected persona doesn't match the signal → overall best", () => {
    const learnings = computeLearnings(
      [stat("WHATSAPP", 90, 5, 20000), stat("RCS", 60, 3, 9000)],
      { WHATSAPP: 3, RCS: 3 },
      { persona: "Dormant", channel: "RCS", convertedPct: 7, sent: 40 },
      NOW
    );
    const rec = recommendChannel(learnings, { persona: "NEW" }); // signal is for Dormant, not New
    expect(rec.basis).toBe("overall");
    expect(rec.channel).toBe("WHATSAPP");
  });
});
