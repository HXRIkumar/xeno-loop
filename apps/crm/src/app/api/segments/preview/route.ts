import { NextResponse } from "next/server";
import { SegmentFilterSchema, previewSegment } from "@/lib/segment";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const parsed = SegmentFilterSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid filter", issues: parsed.error.flatten() }, { status: 400 });
  }
  const preview = await previewSegment(parsed.data);
  return NextResponse.json(preview);
}
