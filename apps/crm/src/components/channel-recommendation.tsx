"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkles, Check } from "lucide-react";
import { ChannelBadge } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { recommendChannel, type CampaignLearnings } from "@/lib/learnings";
import type { Channel, Persona } from "@prisma/client";

/**
 * Channel Recommendation (Feature 2) — advisory only, in the manual builder. Fetches /api/learnings
 * (the SAME single source of truth as the agent's get_campaign_learnings tool and the "What Loop
 * learned" panel, so the numbers can never disagree) and renders a confidence-aware channel pick via
 * the pure recommendChannel(). The marketer can accept it with one click or ignore it entirely — it
 * never auto-selects or fires. Fails quiet so it can't block campaign creation.
 *
 * `persona` is passed by the builder ONLY when exactly one persona is selected — a persona-specific
 * claim ("for Dormant customers…") is only honest for a single-persona audience.
 */
export function ChannelRecommendation({
  value,
  onUse,
  persona,
}: {
  value: Channel;
  onUse: (channel: Channel) => void;
  persona?: Persona;
}) {
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

  // Re-derive on persona change off the already-fetched data — no refetch (same source of truth).
  const rec = useMemo(
    () => (data ? recommendChannel(data, persona ? { persona } : undefined) : null),
    [data, persona]
  );

  if (failed || !rec) return null; // advisory; stay quiet while loading or if the fetch failed

  // Cold-start: neutral, honest helper — never a fabricated pick.
  if (rec.basis === "cold-start" || !rec.channel) {
    return (
      <p className="text-xs text-muted-foreground">
        No past data yet — pick a channel; Loop will learn from the result.
      </p>
    );
  }

  const alreadySelected = value === rec.channel;

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/[0.03] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
          <Sparkles className="h-3.5 w-3.5" /> Loop recommends
        </span>
        <ChannelBadge channel={rec.channel} />
        {rec.confidence === "low" && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            limited data
          </span>
        )}
        <div className="ml-auto">
          {alreadySelected ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Check className="h-3.5 w-3.5 text-primary" /> Selected
            </span>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => onUse(rec.channel as Channel)}>
              Use this channel
            </Button>
          )}
        </div>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{rec.reason}</p>
    </div>
  );
}
