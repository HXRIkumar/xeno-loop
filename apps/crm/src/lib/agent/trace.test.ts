import { describe, it, expect } from "vitest";
import {
  summarizeToolResult,
  applyTraceEvent,
  type AgentTrace,
  type AgentEvent,
} from "./trace";

// The step-event SHAPING logic — the one-liners that make the trace explainable. These assert the
// exact contract against the REAL tool result shapes (see lib/agent/tools.ts).
describe("summarizeToolResult", () => {
  it("analyse_audience → count + dominant persona + avg LTV (Indian-grouped)", () => {
    const result = {
      count: 50,
      avgLtv: 47757,
      personaBreakdown: [
        { persona: "Dormant", count: 50 },
        { persona: "High Spender", count: 3 },
      ],
    };
    expect(summarizeToolResult("analyse_audience", {}, result, true)).toBe(
      "50 Dormant customers · avg LTV ₹47,757"
    );
  });

  it("analyse_audience → degrades gracefully with no personas / no ltv", () => {
    expect(summarizeToolResult("analyse_audience", {}, { count: 7 }, true)).toBe("7 customers");
  });

  it("get_past_performance → top-2 convert rates + best channel", () => {
    const result = {
      channels: [
        { channel: "WHATSAPP", convertRate: 0 },
        { channel: "RCS", convertRate: 4 },
        { channel: "SMS", convertRate: 1 },
        { channel: "EMAIL", convertRate: 0 },
      ],
    };
    expect(summarizeToolResult("get_past_performance", {}, result, true)).toBe(
      "convert: RCS 4% · SMS 1% · best = RCS"
    );
  });

  it("get_past_performance → handles no history", () => {
    expect(summarizeToolResult("get_past_performance", {}, { channels: [] }, true)).toBe(
      "no past campaigns yet"
    );
  });

  it("draft_message → derives from args (goal/persona/tone)", () => {
    expect(
      summarizeToolResult("draft_message", { goal: "win-back", persona: "DORMANT", tone: "warm" }, {}, true)
    ).toBe("win-back copy for DORMANT · warm tone");
  });

  it("propose_campaign → quoted name + ready to approve", () => {
    const result = { name: "Dormant Win-Back", status: "PROPOSED" };
    expect(summarizeToolResult("propose_campaign", {}, result, true)).toBe(
      "‘Dormant Win-Back’ → ready to approve"
    );
  });

  it("renders captured tool error when ok=false", () => {
    expect(summarizeToolResult("analyse_audience", {}, { error: "invalid tool arguments" }, false)).toBe(
      "error: invalid tool arguments"
    );
  });

  it("never throws on a junk/partial result", () => {
    expect(() => summarizeToolResult("analyse_audience", {}, null, true)).not.toThrow();
    expect(() => summarizeToolResult("unknown_tool", {}, undefined, true)).not.toThrow();
    expect(summarizeToolResult("unknown_tool", {}, {}, true)).toBe("done");
  });
});

// The fold used IDENTICALLY by the server (persist) and client (live render) — so they can't drift.
describe("applyTraceEvent", () => {
  const step = (i: number, status: string) =>
    ({
      type: "step",
      step: { kind: "step", stepIndex: i, tool: "analyse_audience", args: {}, status, resultSummary: null, ms: null },
    } as AgentEvent);

  it("appends a new step, then upserts the SAME stepIndex in place (running→done)", () => {
    let t: AgentTrace = [];
    t = applyTraceEvent(t, step(0, "running"));
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ kind: "step", stepIndex: 0, status: "running" });

    t = applyTraceEvent(t, {
      type: "step",
      step: { kind: "step", stepIndex: 0, tool: "analyse_audience", args: {}, status: "done", resultSummary: "7 customers", ms: 120 },
    });
    expect(t).toHaveLength(1); // upserted, not appended
    expect(t[0]).toMatchObject({ status: "done", resultSummary: "7 customers", ms: 120 });
  });

  it("keeps first-seen order while interleaving reasoning", () => {
    let t: AgentTrace = [];
    t = applyTraceEvent(t, step(0, "running"));
    t = applyTraceEvent(t, { type: "reasoning", text: "Let me size the segment." });
    t = applyTraceEvent(t, step(1, "running"));
    t = applyTraceEvent(t, step(0, "done")); // late update to step 0 — must NOT reorder
    expect(t.map((e) => e.kind)).toEqual(["step", "reasoning", "step"]);
    expect((t[0] as { status: string }).status).toBe("done");
    expect((t[2] as { stepIndex: number }).stepIndex).toBe(1);
  });

  it("ignores empty reasoning", () => {
    const t = applyTraceEvent([], { type: "reasoning", text: "   " });
    expect(t).toHaveLength(0);
  });

  it("is immutable (returns a new array, leaves input untouched)", () => {
    const a: AgentTrace = [];
    const b = applyTraceEvent(a, step(0, "running"));
    expect(a).toHaveLength(0);
    expect(b).not.toBe(a);
  });
});
