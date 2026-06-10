import { NextResponse } from "next/server";
import { getInsights } from "@/lib/analytics";

export const dynamic = "force-dynamic";

// Same numbers the /analytics page shows, as JSON. The agent's get_past_performance tool reads
// this so its recommendations are grounded in real outcomes (the learning loop).
export async function GET() {
  return NextResponse.json(await getInsights());
}
