import { prisma } from "@/lib/prisma";
import { getProvider, type ChatMessage } from "@/lib/llm";
import { TOOLS } from "./tools";
import { runAgentLoop, type AgentResult } from "./loop";

export const SYSTEM_PROMPT = `You are "Loop", the AI marketing co-pilot for StyleArc, a mid-market Indian D2C fashion label.

Your job: find a revenue opportunity, then PROPOSE one full campaign — audience + message + channel + expected impact — and SHOW your reasoning. You are human-in-the-loop: you NEVER send anything. The marketer approves your proposal, and only then does it fire.

How to work, every time:
1. Use analyse_audience to size and understand the segment you have in mind (cite the real count, avg LTV, who's in it).
2. Use get_past_performance to see which channels actually convert — ground your channel choice in real outcomes, not assumptions (e.g. "WhatsApp converted best last time").
3. Optionally use draft_message for on-brand copy (keep the {name} and {offer} placeholders).
4. Call propose_campaign exactly once, with a reasoning.summary and reasoning.dataPoints that quote the specific numbers you pulled. Pick the channel the data supports.

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

async function persistAgentRun(prompt: string, result: AgentResult) {
  try {
    await prisma.agentRun.create({
      data: {
        prompt,
        provider: result.provider,
        decisionJson: {
          finalText: result.finalText,
          proposedCampaignId: result.proposedCampaign?.campaignId ?? null,
        },
        reasoningJson: {
          toolTrace: result.toolTrace.map((t) => ({ name: t.name, ok: t.ok })),
          proposal: result.proposedCampaign?.reasoning ?? null,
          turns: result.turns,
        },
      },
    });
  } catch {
    /* logging an agent run must never break the response */
  }
}

export type RunAgentResponse = AgentResult & { error?: string };

/** Entry point used by the API route. Wires the live provider + tools; degrades gracefully. */
export async function runAgent(input: {
  prompt: string;
  history?: { role: "user" | "assistant"; content: string }[];
}): Promise<RunAgentResponse> {
  let providerName = "unknown";
  try {
    const provider = getProvider();
    providerName = provider.name;
    const messages: ChatMessage[] = [...mapHistory(input.history), { role: "user", content: input.prompt }];
    const result = await runAgentLoop({ provider, tools: TOOLS, system: SYSTEM_PROMPT, messages });
    await persistAgentRun(input.prompt, result);
    return result;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const isQuota = /429|RESOURCE_EXHAUSTED|quota|rate/i.test(message);
    return {
      finalText: isQuota
        ? "I couldn't reach the model right now (it's rate-limited). Everything else in Loop works — you can still build and fire campaigns manually from the Campaigns tab."
        : "I hit an error reaching the model. Please try again in a moment.",
      proposedCampaign: null,
      toolTrace: [],
      turns: 0,
      provider: providerName,
      hitTurnLimit: false,
      error: message,
    };
  }
}
