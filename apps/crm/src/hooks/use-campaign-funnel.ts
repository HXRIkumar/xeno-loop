"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowser, REALTIME_ENABLED } from "@/lib/supabase-browser";
import type { CampaignFunnel } from "@/lib/funnel";

export type ConnMode = "connecting" | "realtime" | "polling";

const POLL_MS = 3000; // spec: 3s polling fallback
const REALTIME_SAFETY_POLL_MS = 10000; // belt-and-braces refetch even on Realtime
const FALLBACK_AFTER_MS = 4000; // if Realtime doesn't subscribe in time, poll

/**
 * useRealtimeOrPoll — keep a campaign's funnel live.
 *   PRIMARY: Supabase Realtime on Communication rows for this campaign → refetch on change.
 *   FALLBACK: 3s polling (also used whenever Realtime is disabled or fails to connect).
 * Stops once the campaign is terminal (COMPLETED/FAILED) so we don't poll forever.
 */
export function useCampaignFunnel(campaignId: string) {
  const [data, setData] = useState<CampaignFunnel | null>(null);
  const [mode, setMode] = useState<ConnMode>("connecting");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const doneRef = useRef(false);

  const clearPoll = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  };

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/funnel`, { cache: "no-store" });
      if (!res.ok) return;
      const json: CampaignFunnel = await res.json();
      setData(json);
      if (json.campaign.status === "COMPLETED" || json.campaign.status === "FAILED") {
        doneRef.current = true;
        clearPoll();
      }
    } catch {
      /* transient — next tick retries */
    }
  }, [campaignId]);

  useEffect(() => {
    let cancelled = false;
    doneRef.current = false;
    refetch();

    const startPolling = (intervalMs: number, label: ConnMode) => {
      clearPoll();
      if (cancelled || doneRef.current) return;
      setMode(label);
      pollRef.current = setInterval(refetch, intervalMs);
    };

    const supabase = REALTIME_ENABLED ? getSupabaseBrowser() : null;

    if (!supabase) {
      startPolling(POLL_MS, "polling");
      return () => {
        cancelled = true;
        clearPoll();
      };
    }

    const channel = supabase
      .channel(`campaign-${campaignId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "Communication", filter: `campaignId=eq.${campaignId}` },
        () => refetch()
      )
      .subscribe((status) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") {
          setMode("realtime");
          startPolling(REALTIME_SAFETY_POLL_MS, "realtime"); // safety net; keeps mode label
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          startPolling(POLL_MS, "polling");
        }
      });

    const fallback = setTimeout(() => {
      if (!cancelled && mode === "connecting") startPolling(POLL_MS, "polling");
    }, FALLBACK_AFTER_MS);

    return () => {
      cancelled = true;
      clearTimeout(fallback);
      supabase.removeChannel(channel);
      clearPoll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, refetch]);

  return { data, mode, refetch };
}
