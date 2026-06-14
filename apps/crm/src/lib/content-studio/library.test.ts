import { describe, it, expect } from "vitest";
import { selectCreative, rankCreatives, scoreCreative, CREATIVE_LIBRARY } from "./library";
import type { CreativeBrief } from "./types";

describe("content-studio library matching", () => {
  it("exact match: theme + persona + channel picks the most specific creative", () => {
    const { item, matched } = selectCreative({ theme: "winback", persona: "DORMANT", channel: "WHATSAPP" });
    expect(item.file).toBe("winback-vip-01.png");
    expect(matched).toBe(true);
  });

  it("persona + channel fallback when the theme doesn't match", () => {
    // unknown theme → theme adds 0; HIGH_SPENDER on RCS still selects the high-spender creative
    const { item } = selectCreative({ theme: "nonexistent", persona: "HIGH_SPENDER", channel: "RCS" });
    expect(item.file).toBe("highspender-01.png");
  });

  it("channel-only fallback when no theme/persona is given", () => {
    const { item, matched } = selectCreative({ channel: "SMS" });
    expect(item.channels).toContain("SMS"); // discount-01 is the only SMS creative
    expect(item.file).toBe("discount-01.png");
    expect(matched).toBe(true);
  });

  it("rotation: same brief + different nonce rotates among equally-good matches", () => {
    // For RCS + winback + DORMANT, both winback-vip-01 (WHATSAPP,RCS) and dormant-rcs-01 (RCS) score 7.
    const brief: CreativeBrief = { theme: "winback", persona: "DORMANT", channel: "RCS" };
    const top = rankCreatives(brief);
    expect(top.map((i) => i.file)).toEqual(["winback-vip-01.png", "dormant-rcs-01.png"]);
    const a = selectCreative({ ...brief, nonce: 0 }).item.file;
    const b = selectCreative({ ...brief, nonce: 1 }).item.file;
    expect(a).not.toBe(b);
    expect(selectCreative({ ...brief, nonce: 2 }).item.file).toBe(a); // wraps around deterministically
  });

  it("generic fallback path: nothing matches → a generic on-brand creative, matched=false", () => {
    // force score 0 with a channel that isn't in any entry (cast past the typed union)
    const { item, matched } = selectCreative({ channel: "CARRIER_PIGEON" as CreativeBrief["channel"] });
    expect(matched).toBe(false);
    expect(item.persona).toBeNull(); // the generic (persona-less) on-brand creative
    expect(item.file).toBe("festive-01.png");
  });

  it("scoreCreative weights theme > persona > channel", () => {
    const winback = CREATIVE_LIBRARY.find((c) => c.file === "winback-vip-01.png")!;
    expect(scoreCreative(winback, { theme: "winback", channel: "SMS" })).toBe(4); // theme only
    expect(scoreCreative(winback, { persona: "DORMANT", channel: "SMS" })).toBe(2); // persona only
    expect(scoreCreative(winback, { channel: "WHATSAPP" })).toBe(1); // channel only
  });
});
