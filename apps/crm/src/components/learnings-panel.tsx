"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ChannelBadge } from "@/components/badges";
import { inr } from "@/lib/utils";
import type { CampaignLearnings } from "@/lib/learnings";
import type { Channel } from "@prisma/client";

/**
 * "What Loop learned" — the visible evidence behind the agent's proposals. Fetches /api/learnings
 * (the SAME aggregation the get_campaign_learnings tool uses, so the human sees exactly what the
 * agent saw). Compact + responsive; flags low-confidence channels rather than over-claiming.
 */
export function LearningsPanel() {
  const [data, setData] = useState<CampaignLearnings | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/learnings")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return null; // supplementary panel — fail quiet, never block the chat

  return (
    <Card className="border-primary/30 bg-primary/[0.03]">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
          <Sparkles className="h-4 w-4" /> What Loop learned
        </div>

        {!data ? (
          <p className="text-sm text-muted-foreground">Loading learnings…</p>
        ) : !data.hasData ? (
          <p className="text-sm text-muted-foreground">
            {data.headline} Loop starts learning the moment your first campaign is fired.
          </p>
        ) : (
          <>
            <p className="text-sm leading-relaxed">{data.headline}</p>

            {/* per-channel mini-cards — scroll horizontally on mobile instead of clipping */}
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {data.perChannel.map((c) => (
                <div key={c.channel} className="min-w-[8rem] shrink-0 rounded-lg border bg-card p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <ChannelBadge channel={c.channel as Channel} />
                    {c.lowConfidence && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">limited data</span>
                    )}
                  </div>
                  <div className="mt-1.5 text-lg font-semibold tabular-nums">{c.convertedPct}%</div>
                  <div className="text-[11px] text-muted-foreground">convert · {inr(c.attributedRevenue)}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {c.sent} sent · {c.campaigns} camp{c.campaigns === 1 ? "" : "s"}
                  </div>
                </div>
              ))}
            </div>

            {data.topPersonaChannel && (
              <p className="text-xs text-muted-foreground">
                Strongest signal:{" "}
                <span className="font-medium text-foreground">{data.topPersonaChannel.persona}</span> convert best on{" "}
                <span className="font-medium text-foreground">{data.topPersonaChannel.channel}</span> (
                {data.topPersonaChannel.convertedPct}%).
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
