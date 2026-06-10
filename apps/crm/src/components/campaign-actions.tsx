"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CampaignStatus } from "@prisma/client";

export function CampaignActions({ id, status }: { id: string; status: CampaignStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(path: "approve" | "fire") {
    setBusy(true);
    setError(null);
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
    </div>
  );
}
