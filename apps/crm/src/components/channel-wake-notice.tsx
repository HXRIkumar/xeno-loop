"use client";

import { Loader2 } from "lucide-react";

/**
 * Cold-start status surface — PRESENTATION ONLY. The channel service runs on a free tier that
 * sleeps when idle, so the first fire after inactivity waits ~30–50s on the wake. CampaignActions
 * arms a short timer when a fire is dispatched; if the service hasn't answered by then, it renders
 * this notice so the delay reads as expected engineered behavior, not a hang. This is purely a view
 * over state CampaignActions already has — it never touches the fire / wake / retry logic.
 *
 * Anchored top-right on desktop / top-center on mobile (below the mobile nav bar) so it clears the
 * fixed bottom-right floating Loop button. Uses the existing Card styling + purple Loop accent.
 */
export function ChannelWakeNotice() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-4 top-16 z-[60] animate-in fade-in-0 slide-in-from-top-2 sm:inset-x-auto sm:right-6 sm:top-6 sm:max-w-sm"
    >
      <div className="rounded-xl border border-primary/40 bg-card p-4 text-left shadow-lg">
        <div className="flex items-start gap-3">
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-primary">Waking the delivery service…</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              The channel service runs on a free tier that sleeps when idle, so the first send after
              inactivity takes ~30–50s to spin up. Sends after this are instant.{" "}
              <span className="text-foreground/70">
                (In production this would be an always-on host.)
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
