"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChannelWakeNotice } from "@/components/channel-wake-notice";
import type { CampaignStatus } from "@prisma/client";

// If a fire's channel-service wake hasn't answered within this window, surface the cold-start
// notice. A warm service answers in well under this, so the notice only shows on a real wake delay.
const COLD_START_NOTICE_MS = 3000;

export function CampaignActions({ id, status }: { id: string; status: CampaignStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waking, setWaking] = useState(false);
  const coldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearColdTimer = () => {
    if (coldTimer.current) clearTimeout(coldTimer.current);
    coldTimer.current = null;
  };

  // Defensive: a successful fire unmounts this island (status → SENDING). Don't leave a timer that
  // would set state after unmount.
  useEffect(() => clearColdTimer, []);

  async function act(path: "approve" | "fire") {
    setBusy(true);
    setError(null);
    // Only a fire reaches the (possibly-asleep) channel service — arm the cold-start notice for it.
    if (path === "fire") {
      coldTimer.current = setTimeout(() => setWaking(true), COLD_START_NOTICE_MS);
    }
    try {
      const res = await fetch(`/api/campaigns/${id}/${path}`, { method: "POST" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Something went wrong");
      } else {
        router.refresh();
      }
    } catch {
      setError("Network error");
    } finally {
      clearColdTimer();
      setWaking(false);
      setBusy(false);
    }
  }

  if (status !== "PROPOSED" && status !== "APPROVED") return null;

  return (
    <div className="flex flex-col items-end gap-1">
      {status === "PROPOSED" ? (
        <Button onClick={() => act("approve")} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Check />} Approve
        </Button>
      ) : (
        <Button onClick={() => act("fire")} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Send />} Fire campaign
        </Button>
      )}
      {error && <span className="text-xs text-destructive">{error}</span>}
      {waking && <ChannelWakeNotice />}
    </div>
  );
}
