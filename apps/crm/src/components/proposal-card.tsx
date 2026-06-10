"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Loader2, Users, Sparkles, ArrowRight, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChannelBadge } from "@/components/badges";
import type { ProposedCampaign } from "@/lib/agent/loop";

/**
 * The explainable proposal card rendered inside the chat: it shows the agent's reasoning AND the
 * audience data it pulled, then lets the marketer approve (PROPOSED → APPROVED) right here.
 * Firing still happens on the campaign page — the human stays in the loop.
 */
export function ProposalCard({ proposal }: { proposal: ProposedCampaign }) {
  const [status, setStatus] = useState<"proposed" | "approving" | "approved">("proposed");

  async function approve() {
    setStatus("approving");
    const res = await fetch(`/api/campaigns/${proposal.campaignId}/approve`, { method: "POST" });
    setStatus(res.ok ? "approved" : "proposed");
  }

  return (
    <div className="overflow-hidden rounded-xl border border-primary/30 bg-card shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b bg-primary/[0.04] px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
          <Megaphone className="h-4 w-4" /> Proposed campaign
        </div>
        <ChannelBadge channel={proposal.channel as never} />
      </div>

      <div className="space-y-4 p-4">
        <div>
          <div className="font-semibold">{proposal.name}</div>
          <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            {proposal.audienceSize} customers · {proposal.segmentDescription}
          </div>
        </div>

        <div className="rounded-lg border bg-muted/40 p-3 text-sm leading-relaxed">
          {proposal.messageTemplate}
        </div>

        {/* the explainable bit — reasoning + the data it pulled */}
        <div className="rounded-lg bg-primary/[0.04] p-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
            <Sparkles className="h-3.5 w-3.5" /> Why
          </div>
          <p className="text-sm leading-relaxed">{proposal.reasoning.summary}</p>
          {proposal.reasoning.dataPoints && proposal.reasoning.dataPoints.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {proposal.reasoning.dataPoints.map((d, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-primary">·</span>
                  {d}
                </li>
              ))}
            </ul>
          )}
        </div>

        {proposal.expectedImpact && Object.keys(proposal.expectedImpact).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(proposal.expectedImpact).map(([k, v]) => (
              <span key={k} className="rounded-md bg-muted px-2 py-1 text-xs">
                <span className="text-muted-foreground">{k}: </span>
                <span className="font-medium tabular-nums">{String(v)}</span>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          {status === "approved" ? (
            <>
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
                <Check className="h-4 w-4" /> Approved
              </span>
              <Button asChild size="sm" variant="outline" className="ml-auto">
                <Link href={`/campaigns/${proposal.campaignId}`}>
                  View &amp; fire <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" onClick={approve} disabled={status === "approving"}>
                {status === "approving" ? <Loader2 className="animate-spin" /> : <Check />} Approve
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link href={`/campaigns/${proposal.campaignId}`}>Edit</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
