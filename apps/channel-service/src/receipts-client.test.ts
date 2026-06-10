import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { deliverReceipt } from "./receipts-client";
import { metrics, deadLetter } from "./state";
import type { SimEvent } from "./simulator";

const ev: SimEvent = {
  providerEventId: "evt-1",
  type: "DELIVERED",
  occurredAt: "2026-06-11T00:00:00.000Z",
  final: false,
  delayMs: 0,
};

const resp = (status: number) =>
  ({ ok: status >= 200 && status < 300, status }) as Response;

describe("deliverReceipt — retry / backoff / dead-letter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    metrics.eventsDeliveredOk = 0;
    metrics.eventsRetried = 0;
    metrics.eventsDeadLettered = 0;
    deadLetter.length = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("retries a transient 503 with backoff, then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(resp(503))
      .mockResolvedValueOnce(resp(200));
    vi.stubGlobal("fetch", fetchMock);

    const p = deliverReceipt("c1", "SMS", ev);
    await vi.runAllTimersAsync(); // advance through the backoff sleep
    await p;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(metrics.eventsDeliveredOk).toBe(1);
    expect(metrics.eventsRetried).toBe(1);
    expect(deadLetter.length).toBe(0);
  });

  it("dead-letters after exhausting retries on persistent 500", async () => {
    const fetchMock = vi.fn().mockResolvedValue(resp(500));
    vi.stubGlobal("fetch", fetchMock);

    const p = deliverReceipt("c2", "EMAIL", ev);
    await vi.runAllTimersAsync();
    await p;

    expect(fetchMock).toHaveBeenCalledTimes(5); // 1 + 4 retries
    expect(metrics.eventsDeadLettered).toBe(1);
    expect(deadLetter[0].communicationId).toBe("c2");
  });

  it("does NOT retry a permanent 404 — straight to dead-letter", async () => {
    const fetchMock = vi.fn().mockResolvedValue(resp(404));
    vi.stubGlobal("fetch", fetchMock);

    const p = deliverReceipt("c3", "RCS", ev);
    await vi.runAllTimersAsync();
    await p;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(metrics.eventsRetried).toBe(0);
    expect(metrics.eventsDeadLettered).toBe(1);
  });
});
