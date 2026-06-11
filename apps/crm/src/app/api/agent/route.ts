import { z } from "zod";
import { runAgent } from "@/lib/agent/agent";
import type { AgentEvent } from "@/lib/agent/trace";

// Streams the Agent Activity Trace as Server-Sent Events: step + reasoning + retry events arrive
// LIVE as the loop runs, then a terminal `final` event carries the reply + proposal card data.
// nodejs runtime (Prisma + AsyncLocalStorage trace bus); maxDuration bounds the run (Vercel guard,
// no-op on a persistent host like Render). The loop is also bounded by MAX_TURNS.
export const runtime = "nodejs";
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
    return new Response(JSON.stringify({ error: "validation failed" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      try {
        // forward every step/reasoning/retry event the moment it happens
        const result = await runAgent(parsed.data, { emit: (e: AgentEvent) => send(e.type, e) });
        // then the terminal payload: final reply + the proposal card data + the persisted run id
        send("final", {
          type: "final",
          finalText: result.finalText,
          proposedCampaign: result.proposedCampaign,
          provider: result.provider,
          turns: result.turns,
          hitTurnLimit: result.hitTurnLimit,
          runId: result.runId ?? null,
          error: result.error ?? null,
        });
      } catch (e) {
        // runAgent already degrades gracefully; this only catches truly unexpected stream errors
        send("error", { type: "error", message: e instanceof Error ? e.message : "agent failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no", // defeat proxy buffering so steps actually arrive live
    },
  });
}
