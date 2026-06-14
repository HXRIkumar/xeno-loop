import { NextResponse } from "next/server";
import { getOpportunities } from "@/lib/opportunities-data";

// Same source of truth as the dashboard's opportunity cards — DB-grounded, stateful.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const opportunities = await getOpportunities();
  return NextResponse.json(opportunities);
}
