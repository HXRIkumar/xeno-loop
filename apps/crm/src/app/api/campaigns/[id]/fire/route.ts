import { NextResponse } from "next/server";
import { fireCampaign } from "@/lib/campaigns";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// allow headroom for waking a cold (sleeping) channel service before the batch dispatch
export const maxDuration = 60;

const REASON: Record<string, { status: number; message: string }> = {
  NOT_FOUND: { status: 404, message: "campaign not found" },
  NOT_FIREABLE: { status: 409, message: "campaign must be approved before firing" },
  EMPTY_AUDIENCE: { status: 409, message: "segment matched no customers" },
  // 503 = transient: rows are persisted, campaign is still re-fireable; just try again shortly.
  DISPATCH_FAILED: {
    status: 503,
    message: "channel service is waking up — try firing again in a few seconds",
  },
};

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await fireCampaign(id);
  if (!result.ok) {
    const r = REASON[result.code];
    return NextResponse.json({ error: r.message }, { status: r.status });
  }
  return NextResponse.json({ ok: true, fired: result.fired, status: "SENDING" });
}
