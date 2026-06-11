/**
 * The provider-agnostic agent loop. It only ever talks to the neutral LLMProvider, so it's
 * identical across Anthropic/OpenAI/Gemini. It's also dependency-injected (provider + tools are
 * passed in) so it can be unit-tested with a mock provider and no network.
 *
 * Each turn: ask the model → if it requested tools, run them (validated, errors caught), append
 * the model's tool-call turn AND the results, and loop — bounded by MAX_TURNS (the Vercel-timeout
 * guard). When the model returns text with no tool calls, that's the final answer.
 */
import type { ChatMessage, LLMProvider } from "@/lib/llm";
import type { Tool } from "./tools";
import { summarizeToolResult } from "./trace";
import { emitStep, emitReasoning, nextStepId } from "./trace-bus";

export const MAX_TURNS = 5;

export type ToolTraceEntry = {
  name: string;
  args: Record<string, unknown>;
  ok: boolean;
  result: unknown;
};

export type ProposedCampaign = {
  campaignId: string;
  name: string;
  audienceSize: number;
  channel: string;
  segmentDescription: string;
  messageTemplate: string;
  reasoning: { summary: string; dataPoints?: string[] };
  expectedImpact: Record<string, string | number> | null;
};

export type AgentResult = {
  finalText: string;
  proposedCampaign: ProposedCampaign | null;
  toolTrace: ToolTraceEntry[];
  turns: number;
  provider: string;
  hitTurnLimit: boolean;
};

export async function runAgentLoop(opts: {
  provider: LLMProvider;
  tools: Record<string, Tool>;
  system: string;
  messages: ChatMessage[];
  maxTurns?: number;
}): Promise<AgentResult> {
  const { provider, tools, system } = opts;
  const messages = [...opts.messages];
  const toolSpecs = Object.values(tools).map((t) => t.spec);
  const maxTurns = opts.maxTurns ?? MAX_TURNS;

  const toolTrace: ToolTraceEntry[] = [];
  let proposedCampaign: ProposedCampaign | null = null;
  let finalText = "";
  let turns = 0;
  let hitTurnLimit = false;

  for (turns = 1; turns <= maxTurns; turns++) {
    const turn = await provider.runTurn({ system, messages, tools: toolSpecs });

    if (turn.stop === "end" || turn.toolCalls.length === 0) {
      finalText = turn.text ?? "";
      break;
    }

    // surface the model's between-step narration (when it produces any) to the live trace
    emitReasoning(turn.text ?? "");

    // record the model's tool-call turn so the provider can echo it back next round
    messages.push({ role: "assistant", content: turn.text, toolCalls: turn.toolCalls });

    for (const call of turn.toolCalls) {
      // trace: open the step row ("running…") before executing — observability only, no logic change
      const stepIndex = nextStepId();
      emitStep({ stepIndex, tool: call.name, args: call.args, status: "running", resultSummary: null, ms: null });
      const startedAt = Date.now();

      const tool = tools[call.name];
      let result: unknown;
      let ok = true;
      if (!tool) {
        ok = false;
        result = { error: `unknown tool: ${call.name}` };
      } else {
        try {
          result = await tool.run(call.args);
        } catch (e) {
          ok = false;
          result = { error: e instanceof Error ? e.message : "tool failed" };
        }
      }

      // trace: resolve the step row to its real result + elapsed time
      emitStep({
        stepIndex,
        tool: call.name,
        args: call.args,
        status: ok ? "done" : "error",
        resultSummary: summarizeToolResult(call.name, call.args, result, ok),
        ms: Date.now() - startedAt,
      });

      toolTrace.push({ name: call.name, args: call.args, ok, result });
      if (ok && call.name === "propose_campaign") {
        proposedCampaign = result as ProposedCampaign;
      }
      messages.push({
        role: "tool",
        toolCallId: call.id,
        name: call.name,
        content: JSON.stringify(result),
      });
    }

    if (turns === maxTurns) hitTurnLimit = true;
  }

  if (!finalText) {
    finalText = proposedCampaign
      ? `I've prepared a proposal: "${proposedCampaign.name}". Review the reasoning and approve when you're ready.`
      : "I gathered the data but didn't reach a final recommendation in the allotted steps. Try narrowing the ask.";
  }

  return { finalText, proposedCampaign, toolTrace, turns: Math.min(turns, maxTurns), provider: provider.name, hitTurnLimit };
}
