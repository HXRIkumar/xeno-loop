import { describe, it, expect } from "vitest";
import { runAgentLoop } from "./loop";
import type { LLMProvider, LLMTurn, ChatMessage, ToolSpec } from "@/lib/llm";
import type { Tool } from "./tools";

// A provider that replays a scripted list of turns and records what it was sent — lets us verify
// the provider-agnostic loop with ZERO network / no LLM quota.
class MockProvider implements LLMProvider {
  readonly name = "mock";
  calls: ChatMessage[][] = [];
  constructor(private script: LLMTurn[]) {}
  async runTurn(input: { system: string; messages: ChatMessage[]; tools: ToolSpec[] }): Promise<LLMTurn> {
    this.calls.push(input.messages.map((m) => ({ ...m })));
    return this.script.shift() ?? { text: "(end of script)", toolCalls: [], stop: "end" };
  }
}

const spec = (name: string): ToolSpec => ({ name, description: name, inputSchema: { type: "object", properties: {} } });

const mockTools: Record<string, Tool> = {
  analyse_audience: { spec: spec("analyse_audience"), run: async () => ({ count: 34, avgLtv: 15000 }) },
  propose_campaign: {
    spec: spec("propose_campaign"),
    run: async () => ({
      campaignId: "camp_1",
      name: "Win back dormant high-LTV",
      audienceSize: 34,
      channel: "WHATSAPP",
      segmentDescription: "Dormant · LTV ≥ ₹10,000",
      messageTemplate: "Hi {name}, ...",
      reasoning: { summary: "34 dormant high-LTV customers; WhatsApp converts best." },
      expectedImpact: { expectedRevenue: 32000 },
    }),
  },
  boom: { spec: spec("boom"), run: async () => { throw new Error("kaboom"); } },
};

const tc = (name: string) => ({ id: `${name}-0`, name, args: {} });

describe("runAgentLoop — provider-agnostic tool loop", () => {
  it("runs tools across turns, echoes results back, and captures the proposed campaign", async () => {
    const provider = new MockProvider([
      { text: null, toolCalls: [tc("analyse_audience")], stop: "tool_use" },
      { text: null, toolCalls: [tc("propose_campaign")], stop: "tool_use" },
      { text: "Proposed a win-back — awaiting your approval.", toolCalls: [], stop: "end" },
    ]);

    const res = await runAgentLoop({
      provider,
      tools: mockTools,
      system: "sys",
      messages: [{ role: "user", content: "win back dormant customers" }],
    });

    expect(res.toolTrace.map((t) => t.name)).toEqual(["analyse_audience", "propose_campaign"]);
    expect(res.toolTrace.every((t) => t.ok)).toBe(true);
    expect(res.proposedCampaign?.campaignId).toBe("camp_1");
    expect(res.finalText).toContain("awaiting your approval");
    expect(res.hitTurnLimit).toBe(false);

    // by the 2nd model call, the analyse_audience RESULT must be in the history (echoed back)
    const secondCall = provider.calls[1];
    expect(secondCall.some((m) => m.role === "tool" && m.name === "analyse_audience")).toBe(true);
    // and the assistant's tool-call turn must precede it
    expect(secondCall.some((m) => m.role === "assistant" && (m.toolCalls?.length ?? 0) > 0)).toBe(true);
  });

  it("degrades gracefully when a tool throws (records failure, keeps going)", async () => {
    const provider = new MockProvider([
      { text: null, toolCalls: [tc("boom")], stop: "tool_use" },
      { text: "Recovered after the tool error.", toolCalls: [], stop: "end" },
    ]);
    const res = await runAgentLoop({ provider, tools: mockTools, system: "sys", messages: [{ role: "user", content: "x" }] });

    expect(res.toolTrace[0].ok).toBe(false);
    expect(res.finalText).toContain("Recovered");
    // the failing tool's error was fed back to the model
    expect(provider.calls[1].some((m) => m.role === "tool" && m.name === "boom")).toBe(true);
  });

  it("stops at MAX_TURNS if the model never finishes", async () => {
    const loopingScript: LLMTurn[] = Array.from({ length: 10 }, () => ({
      text: null,
      toolCalls: [tc("analyse_audience")],
      stop: "tool_use" as const,
    }));
    const provider = new MockProvider(loopingScript);
    const res = await runAgentLoop({
      provider,
      tools: mockTools,
      system: "sys",
      messages: [{ role: "user", content: "loop forever" }],
      maxTurns: 3,
    });

    expect(res.turns).toBe(3);
    expect(res.hitTurnLimit).toBe(true);
    expect(res.finalText.length).toBeGreaterThan(0); // fallback text, not empty
  });
});
