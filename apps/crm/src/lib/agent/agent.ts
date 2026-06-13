import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getProvider, type ChatMessage } from "@/lib/llm";
import { TOOLS } from "./tools";
import { runAgentLoop, type AgentResult } from "./loop";
import { applyTraceEvent, type AgentEvent, type AgentTrace } from "./trace";
import { withTrace } from "./trace-bus";

export const SYSTEM_PROMPT = `You are "Loop", the AI marketing co-pilot for StyleArc, a mid-market Indian D2C fashion label.

Your job: find a revenue opportunity, then PROPOSE one full campaign — audience + message + channel + expected impact — and SHOW your reasoning. You are human-in-the-loop: you NEVER send anything. The marketer approves your proposal, and only then does it fire.

How to work, every time:
1. FIRST call get_campaign_learnings — this is your source of truth for what has actually worked (per-channel conversion, attributed revenue, sample sizes/confidence, best channel, and any strong persona×channel signal). Ground your channel choice in it. If it returns hasData:false, say plainly that there's no campaign history yet and propose on best judgment. Do NOT also call get_past_performance — get_campaign_learnings supersedes it; citing two summaries risks contradicting yourself.
2. Use analyse_audience to size and understand the segment (cite the real count, avg LTV, who's in it).
3. Optionally use draft_message for on-brand copy (keep the {name} and {offer} placeholders).
4. Call propose_campaign exactly once. In reasoning.summary and reasoning.dataPoints, quote the specific learning numbers (e.g. "RCS converted best last time — 4% of sent, ₹14,800") and the audience numbers. Pick the channel the learnings support; respect low-confidence flags (don't over-claim on thin data).

Rules:
- Propose ONE campaign per request unless asked otherwise.
- Always base claims on tool results — never invent numbers.
- StyleArc's voice is warm, stylish, concise. Keep messages short.
- After proposing, tell the marketer in one or two sentences what you proposed and why, and that it's awaiting their approval.`;

function mapHistory(history: { role: "user" | "assistant"; content: string }[] | undefined): ChatMessage[] {
  if (!history) return [];
  return history
    .filter((m) => m.content?.trim())
    .map((m) => ({ role: m.role, content: m.content }));
}

/** Persist the run (incl. the full ordered trace + proposed campaign link) — returns the run id. */
async function persistAgentRun(prompt: string, result: AgentResult, trace: AgentTrace): Promise<string | null> {
  try {
    const run = await prisma.agentRun.create({
      data: {
        prompt,
        provider: result.provider,
        campaignId: result.proposedCampaign?.campaignId ?? null,
        decisionJson: {
          finalText: result.finalText,
          proposedCampaignId: result.proposedCampaign?.campaignId ?? null,
        },
        reasoningJson: {
          toolTrace: result.toolTrace.map((t) => ({ name: t.name, ok: t.ok })),
          proposal: result.proposedCampaign?.reasoning ?? null,
          turns: result.turns,
        },
        traceJson: trace as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    return run.id;
  } catch {
    /* logging an agent run must never break the response */
    return null;
  }
}

export type RunAgentResponse = AgentResult & { error?: string; runId?: string | null };

/**
 * Entry point used by the API route. Wires the live provider + tools; degrades gracefully.
 * Runs inside `withTrace` so the loop + adapters stream step/reasoning/retry events; `opts.emit`
 * forwards them live (SSE) while we ALSO fold them into the ordered trace we persist + return.
 */
export async function runAgent(
  input: { prompt: string; history?: { role: "user" | "assistant"; content: string }[] },
  opts?: { emit?: (e: AgentEvent) => void }
): Promise<RunAgentResponse> {
  let providerName = "unknown";
  let trace: AgentTrace = [];
  const emit = (e: AgentEvent) => {
    trace = applyTraceEvent(trace, e);
    opts?.emit?.(e);
  };

  try {
    const result = await withTrace(emit, async () => {
      const provider = getProvider();
      providerName = provider.name;
      const messages: ChatMessage[] = [...mapHistory(input.history), { role: "user", content: input.prompt }];
      return runAgentLoop({ provider, tools: TOOLS, system: SYSTEM_PROMPT, messages });
    });
    const runId = await persistAgentRun(input.prompt, result, trace);
    return { ...result, runId };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const isQuota = /429|RESOURCE_EXHAUSTED|quota|rate/i.test(message);
    const degraded: AgentResult = {
      finalText: isQuota
        ? "I couldn't reach the model right now (it's rate-limited). Everything else in Loop works — you can still build and fire campaigns manually from the Campaigns tab."
        : "I hit an error reaching the model. Please try again in a moment.",
      proposedCampaign: null,
      toolTrace: [],
      turns: 0,
      provider: providerName,
      hitTurnLimit: false,
    };
    const runId = await persistAgentRun(input.prompt, degraded, trace);
    return { ...degraded, error: message, runId };
  }
}
