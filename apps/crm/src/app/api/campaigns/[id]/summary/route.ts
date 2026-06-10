import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeCampaignFunnel } from "@/lib/funnel";
import { getProvider } from "@/lib/llm";
import { inr } from "@/lib/utils";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/**
 * After a campaign completes, have the agent summarise the result in natural language and store
 * it as an AgentRun (with the provider name). Falls back to a deterministic summary if the model
 * is unreachable, so the feature is always demo-safe.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const funnel = await computeCampaignFunnel(id);
  if (!funnel) return NextResponse.json({ error: "not found" }, { status: 404 });

  const s = Object.fromEntries(funnel.stages.map((x) => [x.key, x.count]));
  const facts = `Campaign "${funnel.campaign.name}" on ${funnel.campaign.channel}: sent ${s.sent}, delivered ${s.delivered}, opened ${s.opened}, clicked ${s.clicked}, converted ${s.converted}. Attributed revenue ${inr(
    funnel.attributedRevenue
  )} from ${funnel.attributedOrders} orders. ${funnel.failed} failed to deliver.`;

  const deterministic = `${funnel.campaign.name} reached ${s.sent} customers on ${funnel.campaign.channel}. ${s.delivered} delivered, ${s.clicked} clicked, and ${s.converted} converted — driving ${inr(
    funnel.attributedRevenue
  )} in attributed revenue. ${
    s.converted > 0 ? "Worth repeating on the channels that converted." : "Consider a different channel or offer next time."
  }`;

  let summary = deterministic;
  let provider = "fallback";
  try {
    const p = getProvider();
    provider = p.name;
    const turn = await p.runTurn({
      system:
        "You are Loop, StyleArc's marketing co-pilot. Summarise a finished campaign's results in 2-3 warm, concrete sentences for the marketer. Use the numbers given; do not invent any.",
      messages: [{ role: "user", content: facts }],
      tools: [],
    });
    if (turn.text?.trim()) summary = turn.text.trim();
  } catch {
    /* keep deterministic fallback */
  }

  await prisma.agentRun.create({
    data: {
      prompt: `Summarise campaign ${id}`,
      provider,
      decisionJson: { summary },
      reasoningJson: { funnel: s, attributedRevenue: funnel.attributedRevenue },
    },
  });

  return NextResponse.json({ summary, provider });
}
