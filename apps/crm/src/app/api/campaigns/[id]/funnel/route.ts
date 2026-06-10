import { NextResponse } from "next/server";
import { computeCampaignFunnel } from "@/lib/funnel";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const funnel = await computeCampaignFunnel(id);
  if (!funnel) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(funnel);
}
