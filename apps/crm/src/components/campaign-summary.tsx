"use client";

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/** After a campaign completes, let Loop summarise the result in natural language (stored as an
 * AgentRun server-side). Falls back to a deterministic summary if the model is unavailable. */
export function CampaignSummary({ campaignId }: { campaignId: string }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/summary`, { method: "POST" });
      const d = await res.json();
      setSummary(d.summary ?? "No summary available.");
    } catch {
      setSummary("Couldn't generate a summary right now.");
    } finally {
      setLoading(false);
    }
  }

  if (summary) {
    return (
      <Card className="border-primary/30 bg-primary/[0.03]">
        <CardContent className="space-y-2 p-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Sparkles className="h-4 w-4" /> Loop&apos;s wrap-up
          </div>
          <p className="text-sm leading-relaxed">{summary}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Button variant="outline" onClick={run} disabled={loading} className="w-full">
      {loading ? <Loader2 className="animate-spin" /> : <Sparkles />} Ask Loop to summarise results
    </Button>
  );
}
