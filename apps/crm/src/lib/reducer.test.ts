import { describe, it, expect } from "vitest";
import { deriveStatus, isTerminalStatus, type EventLike } from "./reducer";

const ev = (type: EventLike["type"], occurredAt?: string): EventLike => ({ type, occurredAt });

describe("deriveStatus — the reconciling state machine", () => {
  it("returns QUEUED for an empty log", () => {
    expect(deriveStatus([])).toBe("QUEUED");
  });

  it("derives the furthest stage from an in-order log", () => {
    expect(deriveStatus([ev("SENT"), ev("DELIVERED"), ev("OPENED")])).toBe("OPENED");
  });

  it("is correct when events arrive OUT OF ORDER (READ before DELIVERED)", () => {
    // max-rank means arrival order doesn't matter
    expect(deriveStatus([ev("READ"), ev("SENT"), ev("DELIVERED")])).toBe("READ");
    expect(deriveStatus([ev("CONVERTED"), ev("DELIVERED")])).toBe("CONVERTED");
  });

  it("is idempotent to DUPLICATE events", () => {
    expect(
      deriveStatus([ev("SENT"), ev("DELIVERED"), ev("DELIVERED"), ev("OPENED"), ev("OPENED")])
    ).toBe("OPENED");
  });

  it("treats FAILED as terminal when nothing was ever delivered", () => {
    expect(deriveStatus([ev("SENT"), ev("FAILED")])).toBe("FAILED");
    expect(deriveStatus([ev("FAILED")])).toBe("FAILED");
    expect(deriveStatus([ev("QUEUED"), ev("FAILED")])).toBe("FAILED");
  });

  it("lets proof of delivery supersede a stray FAILED (delivery proven)", () => {
    expect(deriveStatus([ev("DELIVERED"), ev("FAILED")])).toBe("DELIVERED");
    expect(deriveStatus([ev("FAILED"), ev("READ")])).toBe("READ");
  });

  it("handles a SENT-only log without marking it delivered or failed", () => {
    expect(deriveStatus([ev("SENT")])).toBe("SENT");
  });

  it("reaches CONVERTED at the top of the funnel", () => {
    expect(
      deriveStatus([
        ev("SENT"),
        ev("DELIVERED"),
        ev("OPENED"),
        ev("READ"),
        ev("CLICKED"),
        ev("CONVERTED"),
      ])
    ).toBe("CONVERTED");
  });

  it("order of the input array never changes the result (commutative)", () => {
    const log = [ev("CLICKED"), ev("SENT"), ev("CONVERTED"), ev("OPENED"), ev("DELIVERED")];
    const shuffled = [...log].reverse();
    expect(deriveStatus(log)).toBe(deriveStatus(shuffled));
    expect(deriveStatus(log)).toBe("CONVERTED");
  });
});

describe("isTerminalStatus", () => {
  it("marks CONVERTED and FAILED terminal", () => {
    expect(isTerminalStatus("CONVERTED")).toBe(true);
    expect(isTerminalStatus("FAILED")).toBe(true);
  });
  it("does not mark mid-funnel stages terminal", () => {
    for (const s of ["QUEUED", "SENT", "DELIVERED", "OPENED", "READ", "CLICKED"] as const) {
      expect(isTerminalStatus(s)).toBe(false);
    }
  });
});
