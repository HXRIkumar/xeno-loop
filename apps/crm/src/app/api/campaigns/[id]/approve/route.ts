import { NextResponse } from "next/server";
import { approveCampaign } from "@/lib/campaigns";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ok = await approveCampaign(id);
  if (!ok) {
    return NextResponse.json({ error: "campaign not in PROPOSED state" }, { status: 409 });
  }
  return NextResponse.json({ ok: true, status: "APPROVED" });
}
