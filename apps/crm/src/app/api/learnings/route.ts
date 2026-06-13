import { NextResponse } from "next/server";
import { getCampaignLearnings } from "@/lib/learnings-data";

// Same aggregation the get_campaign_learnings tool uses → the panel can never disagree with the agent.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const learnings = await getCampaignLearnings();
  return NextResponse.json(learnings);
}
