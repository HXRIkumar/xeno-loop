import { NextResponse } from "next/server";
import { fireCampaign } from "@/lib/campaigns";

export const dynamic = "force-dynamic";

const REASON: Record<string, { status: number; message: string }> = {
  NOT_FOUND: { status: 404, message: "campaign not found" },
  NOT_APPROVED: { status: 409, message: "campaign must be APPROVED before firing" },
  EMPTY_AUDIENCE: { status: 409, message: "segment matched no customers" },
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
