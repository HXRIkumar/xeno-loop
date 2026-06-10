import { describe, it, expect } from "vitest";
import { buildTimeline } from "./simulator";
import { CHANNEL_PROFILES, CHANNELS } from "./config";

const N = 4000;

function rates(channel: Parameters<typeof buildTimeline>[0]) {
  let delivered = 0;
  let converted = 0;
  let final = 0;
  let monotonicOk = 0;
  for (let i = 0; i < N; i++) {
    const t = buildTimeline(channel);
    if (t.some((e) => e.type === "DELIVERED")) delivered++;
    if (t.some((e) => e.type === "CONVERTED")) converted++;
    if (t.filter((e) => e.final).length === 1) final++;
    // occurredAt must be strictly increasing (true chronological order)
    const times = t.map((e) => new Date(e.occurredAt).getTime());
    if (times.every((v, idx) => idx === 0 || v > times[idx - 1])) monotonicOk++;
  }
  return { delivered: delivered / N, converted: converted / N, final, monotonicOk };
}

describe("buildTimeline — channel-aware simulator", () => {
  it("always starts with exactly one final event and monotonic occurredAt", () => {
    for (const ch of CHANNELS) {
      const r = rates(ch);
      expect(r.final).toBe(N); // exactly one final per timeline
      expect(r.monotonicOk).toBe(N);
    }
  });

  it("delivered-rate tracks each channel's configured probability (±4%)", () => {
    for (const ch of CHANNELS) {
      const r = rates(ch);
      expect(Math.abs(r.delivered - CHANNEL_PROFILES[ch].delivered)).toBeLessThan(0.04);
    }
  });

  it("channels genuinely differ — WhatsApp converts more than SMS", () => {
    const wa = rates("WHATSAPP").converted;
    const sms = rates("SMS").converted;
    // WhatsApp's funnel (0.92*0.8*0.7*0.3*0.12) >> SMS (0.97*0.55*0.6*0.12*0.10)
    expect(wa).toBeGreaterThan(sms);
  });
});
