import { NextResponse } from "next/server";
import { z } from "zod";
import { getImageProvider } from "@/lib/content-studio";

// Content Studio creative generation — goes through the ImageProvider interface (library by default).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BriefSchema = z.object({
  channel: z.enum(["WHATSAPP", "RCS", "SMS", "EMAIL"]),
  persona: z.string().optional(),
  theme: z.string().optional(),
  nonce: z.number().int().optional(),
});

export async function POST(req: Request) {
  const parsed = BriefSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid brief", issues: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const creative = await getImageProvider().generate(parsed.data);
    return NextResponse.json(creative);
  } catch (e) {
    // e.g. the model-provider stub — surface honestly rather than 500 silently.
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "creative generation failed" },
      { status: 503 }
    );
  }
}
