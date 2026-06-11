"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProposalCard } from "@/components/proposal-card";
import { AgentTrace } from "@/components/agent-trace";
import { cn } from "@/lib/utils";
import { applyTraceEvent, type AgentEvent, type AgentTrace as Trace } from "@/lib/agent/trace";
import type { ProposedCampaign } from "@/lib/agent/loop";

type ChatMsg = {
  role: "user" | "assistant";
  content: string;
  proposal?: ProposedCampaign | null;
  trace?: Trace;
  streaming?: boolean;
  error?: boolean;
};

const SUGGESTIONS = [
  "Find me a revenue opportunity and propose a campaign.",
  "Win back our dormant high-LTV customers.",
  "Which channel converts best, and why?",
];

/** Parse one SSE block ("event: x\ndata: {...}") into { event, data }. */
function parseSSE(block: string): { event: string; data: unknown } | null {
  let event = "message";
  let data = "";
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  if (!data) return null;
  try {
    return { event, data: JSON.parse(data) };
  } catch {
    return null;
  }
}

type FinalPayload = {
  finalText?: string;
  proposedCampaign?: ProposedCampaign | null;
  error?: string | null;
};

export function ChatPanel({ initialPrompt }: { initialPrompt?: string }) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentInitial = useRef(false);

  async function send(prompt: string) {
    const text = prompt.trim();
    if (!text || loading) return;

    const history = messages
      .filter((m) => !m.error && m.content)
      .map((m) => ({ role: m.role, content: m.content }));

    // add the user turn + a live assistant placeholder we'll stream the trace into
    setMessages((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "", trace: [], streaming: true }]);
    setInput("");
    setLoading(true);

    // patch the last (assistant) message
    const patchLast = (fn: (prev: ChatMsg) => ChatMsg) =>
      setMessages((ms) => {
        const copy = ms.slice();
        copy[copy.length - 1] = fn(copy[copy.length - 1]);
        return copy;
      });

    let trace: Trace = [];
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: text, history }),
      });

      if (!res.ok || !res.body) {
        patchLast((p) => ({ ...p, content: "I couldn't process that request.", error: true, streaming: false }));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        // SSE frames are separated by a blank line
        while ((nl = buf.indexOf("\n\n")) !== -1) {
          const frame = buf.slice(0, nl);
          buf = buf.slice(nl + 2);
          const parsed = parseSSE(frame);
          if (!parsed) continue;

          if (parsed.event === "step" || parsed.event === "reasoning") {
            trace = applyTraceEvent(trace, parsed.data as AgentEvent);
            const snapshot = trace;
            patchLast((p) => ({ ...p, trace: snapshot }));
          } else if (parsed.event === "final") {
            const d = parsed.data as FinalPayload;
            patchLast((p) => ({
              ...p,
              content: d.finalText ?? "…",
              proposal: d.proposedCampaign ?? null,
              error: !!d.error,
              streaming: false,
              trace,
            }));
          } else if (parsed.event === "error") {
            const d = parsed.data as { message?: string };
            patchLast((p) => ({ ...p, content: d.message ?? "Something went wrong.", error: true, streaming: false }));
          }
        }
      }
    } catch {
      patchLast((p) => ({ ...p, content: "Network error reaching Loop.", error: true, streaming: false }));
    } finally {
      setLoading(false);
      patchLast((p) => (p.streaming ? { ...p, streaming: false } : p));
    }
  }

  useEffect(() => {
    if (initialPrompt && !sentInitial.current) {
      sentInitial.current = true;
      send(initialPrompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="mx-auto max-w-md space-y-4 py-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <div className="font-semibold">Loop — your marketing co-pilot</div>
              <p className="mt-1 text-sm text-muted-foreground">
                I read your live customer data, propose a campaign with my reasoning shown, and you
                approve. I never send anything on my own.
              </p>
            </div>
            <div className="space-y-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="block w-full rounded-lg border bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[88%] space-y-2", m.role === "user" && "items-end")}>
              {/* the live Agent Activity Trace sits above the reply */}
              {m.role === "assistant" && m.trace && (m.trace.length > 0 || m.streaming) && (
                <AgentTrace entries={m.trace} live={!!m.streaming} defaultOpen />
              )}

              {m.content && (
                <div
                  className={cn(
                    "whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : m.error
                        ? "bg-destructive/10 text-destructive"
                        : "bg-muted"
                  )}
                >
                  {m.content}
                </div>
              )}

              {m.proposal && <ProposalCard proposal={m.proposal} />}
            </div>
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-center gap-2 border-t p-3"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Loop to find an opportunity…"
          disabled={loading}
        />
        <Button type="submit" size="icon" disabled={loading || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
