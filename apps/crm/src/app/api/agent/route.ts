import { NextResponse } from "next/server";
import { z } from "zod";
import { runAgent } from "@/lib/agent/agent";

// Vercel timeout guard: cap the serverless function so a runaway agent can't hang. The loop is
// also bounded by MAX_TURNS (~5), and the Gemini adapter has its own timeouts/backoff. We return
// the whole result at once (no streaming) — simpler and robust for a bounded tool-use loop; the
// UI shows a thinking state meanwhile.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const Body = z.object({
  prompt: z.string().min(1).max(2000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .max(20)
    .optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation failed" }, { status: 400 });
  }
  const result = await runAgent(parsed.data);
  return NextResponse.json(result);
}
