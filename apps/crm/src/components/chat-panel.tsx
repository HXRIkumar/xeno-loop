"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Loader2, Sparkles, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProposalCard } from "@/components/proposal-card";
import { cn } from "@/lib/utils";
import type { ProposedCampaign } from "@/lib/agent/loop";

type ChatMsg = {
  role: "user" | "assistant";
  content: string;
  proposal?: ProposedCampaign | null;
  tools?: string[];
  error?: boolean;
};

const SUGGESTIONS = [
  "Find me a revenue opportunity and propose a campaign.",
  "Win back our dormant high-LTV customers.",
  "Which channel converts best, and why?",
];

const TOOL_LABEL: Record<string, string> = {
  analyse_audience: "analysed audience",
  get_past_performance: "checked past performance",
  draft_message: "drafted copy",
  propose_campaign: "proposed campaign",
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
    const history = messages.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: text, history }),
      });
      const data = await res.json();
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: data.finalText ?? "…",
          proposal: data.proposedCampaign ?? null,
          tools: Array.isArray(data.toolTrace) ? data.toolTrace.map((t: { name: string }) => t.name) : [],
          error: !!data.error,
        },
      ]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Network error reaching Loop.", error: true }]);
    } finally {
      setLoading(false);
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
            <div className={cn("max-w-[85%] space-y-2", m.role === "user" && "items-end")}>
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
              {m.tools && m.tools.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
                  <Wrench className="h-3 w-3" />
                  {m.tools.map((t, j) => (
                    <span key={j} className="rounded bg-muted px-1.5 py-0.5">
                      {TOOL_LABEL[t] ?? t}
                    </span>
                  ))}
                </div>
              )}
              {m.proposal && <ProposalCard proposal={m.proposal} />}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loop is thinking…
            </div>
          </div>
        )}
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
