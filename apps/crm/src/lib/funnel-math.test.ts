import { describe, it, expect } from "vitest";
import { cumulativeFunnel, funnelRates, rate } from "./funnel-math";

describe("cumulativeFunnel", () => {
  it("accumulates each stage from per-status counts", () => {
    // 100 total: 5 queued, 10 failed, 20 delivered, 25 opened, 20 read, 15 clicked, 5 converted
    const f = cumulativeFunnel({
      QUEUED: 5,
      FAILED: 10,
      DELIVERED: 20,
      OPENED: 25,
      READ: 20,
      CLICKED: 15,
      CONVERTED: 5,
    });
    expect(f.total).toBe(100);
    expect(f.sent).toBe(95); // total - queued
    expect(f.converted).toBe(5);
    expect(f.clicked).toBe(20); // 15 + 5
    expect(f.read).toBe(40); // 20 + 20
    expect(f.opened).toBe(65); // 25 + 40
    expect(f.delivered).toBe(85); // 20 + 65
    expect(f.failed).toBe(10);
  });

  it("never lets a deeper stage exceed a shallower one (monotonic)", () => {
    const f = cumulativeFunnel({ SENT: 0, DELIVERED: 3, OPENED: 2, READ: 1, CLICKED: 1, CONVERTED: 1 });
    expect(f.delivered).toBeGreaterThanOrEqual(f.opened);
    expect(f.opened).toBeGreaterThanOrEqual(f.read);
    expect(f.read).toBeGreaterThanOrEqual(f.clicked);
    expect(f.clicked).toBeGreaterThanOrEqual(f.converted);
  });

  it("handles an empty set", () => {
    const f = cumulativeFunnel({});
    expect(f.total).toBe(0);
    expect(f.sent).toBe(0);
  });
});

describe("funnelRates", () => {
  it("computes stage-relative rates and overall convert rate of sent", () => {
    const f = cumulativeFunnel({ DELIVERED: 10, OPENED: 30, READ: 30, CLICKED: 20, CONVERTED: 10 });
    // total 100, sent 100, delivered 100, opened 90, read 60, clicked 30, converted 10
    const r = funnelRates(f);
    expect(r.deliveredRate).toBe(100);
    expect(r.openRate).toBe(90);
    expect(r.convertRate).toBe(10);
  });

  it("is NaN-safe when denominators are zero", () => {
    const r = funnelRates(cumulativeFunnel({}));
    expect(r.deliveredRate).toBe(0);
    expect(r.convertRate).toBe(0);
  });
});

describe("rate", () => {
  it("rounds and guards divide-by-zero", () => {
    expect(rate(1, 3)).toBe(33);
    expect(rate(2, 3)).toBe(67);
    expect(rate(5, 0)).toBe(0);
  });
});
