"use client";

import { Radio, Wifi, IndianRupee, ShoppingBag, AlertTriangle } from "lucide-react";
import { useCampaignFunnel, type ConnMode } from "@/hooks/use-campaign-funnel";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { inr } from "@/lib/utils";
import { cn } from "@/lib/utils";

function LiveBadge({ mode }: { mode: ConnMode }) {
  const label =
    mode === "realtime" ? "Live · Realtime" : mode === "polling" ? "Live · polling 3s" : "Connecting…";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
      </span>
      {mode === "realtime" ? <Radio className="h-3 w-3" /> : <Wifi className="h-3 w-3" />}
      {label}
    </span>
  );
}

export function CampaignFunnel({ campaignId }: { campaignId: string }) {
  const { data, mode } = useCampaignFunnel(campaignId);

  if (!data) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  const sent = data.stages[0]?.count ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Delivery funnel
        </h2>
        <LiveBadge mode={mode} />
      </div>

      <div className="space-y-2.5">
        {data.stages.map((stage) => {
          const widthPct = sent ? Math.max(4, (stage.count / sent) * 100) : 4;
          const isConvert = stage.key === "converted";
          return (
            <div key={stage.key} className="flex items-center gap-3">
              <div className="w-24 shrink-0 text-sm font-medium">{stage.label}</div>
              <div className="relative h-9 flex-1 overflow-hidden rounded-md bg-muted">
                <div
                  className={cn(
                    "flex h-full items-center justify-between rounded-md px-3 text-xs font-medium text-primary-foreground transition-[width] duration-500",
                    isConvert ? "bg-success" : "bg-primary/85"
                  )}
                  style={{ width: `${widthPct}%` }}
                >
                  <span className="tabular-nums">{stage.count}</span>
                </div>
              </div>
              <div className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {stage.rateOfSent}%
              </div>
            </div>
          );
        })}
      </div>

      {data.failed > 0 && (
        <div className="flex items-center gap-2 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5" />
          {data.failed} failed to deliver (terminal)
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10 text-success">
              <IndianRupee className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Attributed revenue
              </div>
              <div className="text-xl font-semibold tabular-nums">{inr(data.attributedRevenue)}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShoppingBag className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Attributed orders
              </div>
              <div className="text-xl font-semibold tabular-nums">{data.attributedOrders}</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
