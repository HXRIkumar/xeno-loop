/**
 * Agent Activity Trace — the observability layer behind the Loop chat's live step feed.
 *
 * This is intentionally self-contained and PROVIDER-AGNOSTIC: it knows nothing about Groq/Gemini.
 * The agent loop emits step + reasoning events here as they happen; LLM adapters emit retry events
 * the same way. A request-scoped event bus (AsyncLocalStorage) lets code deep in the call stack
 * (an adapter mid-retry) reach the active stream WITHOUT threading a callback through the
 * LLMProvider interface — so we surface what already happens without altering the contract.
 *
 * This module is PURE and ISOMORPHIC (no node-only imports) so the client can import the types +
 * `applyTraceEvent` to render live. The server-only event bus (AsyncLocalStorage) lives in the
 * sibling `trace-bus.ts`, which the loop + adapters use to emit.
 *
 * Two pure concerns live here, each testable in isolation:
 *   1. `summarizeToolResult` — turns a real tool result into a one-line human summary.
 *   2. `applyTraceEvent` — folds an event stream into an ordered trace; used identically by the
 *      server (to persist) and the client (to render live), so they can never diverge.
 */
import { inr } from "@/lib/utils";

// ----------------------------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------------------------

export type StepStatus = "running" | "done" | "error" | "retrying" | "recovered";

/** One tool call (or a provider re-sample, tool="model") as a row in the trace. */
export type StepEntry = {
  kind: "step";
  stepIndex: number; // stable id for live upserts AND the render/order key
  tool: string; // tool name, or "model" for an LLM re-sample
  args: Record<string, unknown>;
  status: StepStatus;
  resultSummary: string | null;
  ms: number | null;
};

/** The model's brief between-step narration, when it produces any. */
export type ReasoningEntry = { kind: "reasoning"; text: string };

export type TraceEntry = StepEntry | ReasoningEntry;

/** The full ordered trace persisted on an AgentRun and replayed on past proposals. */
export type AgentTrace = TraceEntry[];

/** Incremental events streamed to the client (SSE). Steps are re-sent as status changes. */
export type AgentEvent =
  | { type: "step"; step: StepEntry }
  | { type: "reasoning"; text: string };

// ----------------------------------------------------------------------------------------------
// Pure: fold an event stream into an ordered trace (server persists with it; client renders with it)
// ----------------------------------------------------------------------------------------------

/**
 * Apply one event to the trace, returning a NEW array (immutable — safe for React state).
 * Steps upsert by stepIndex (running→done/error/retrying→recovered all land in the same row,
 * fixed at first-seen position); reasoning appends in arrival order. Same logic both sides.
 */
export function applyTraceEvent(entries: AgentTrace, event: AgentEvent): AgentTrace {
  if (event.type === "reasoning") {
    if (!event.text.trim()) return entries;
    return [...entries, { kind: "reasoning", text: event.text }];
  }
  // step: upsert by stepIndex
  const i = entries.findIndex((e) => e.kind === "step" && e.stepIndex === event.step.stepIndex);
  if (i === -1) return [...entries, event.step];
  const next = entries.slice();
  next[i] = event.step;
  return next;
}

// ----------------------------------------------------------------------------------------------
// Pure: human one-line summary derived from the REAL tool result (the explainable bit)
// ----------------------------------------------------------------------------------------------

type AnyRec = Record<string, unknown>;
const asRec = (v: unknown): AnyRec => (v && typeof v === "object" ? (v as AnyRec) : {});
const asNum = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const asStr = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/**
 * Turn a tool's real result into a one-liner for the trace row. Pure and defensive (tolerates
 * partial shapes) so it never throws mid-stream. `ok=false` renders the captured error.
 */
export function summarizeToolResult(
  tool: string,
  args: AnyRec,
  result: unknown,
  ok: boolean
): string {
  if (!ok) {
    const err = asStr(asRec(result).error);
    return err ? `error: ${err.length > 90 ? err.slice(0, 90) + "…" : err}` : "error";
  }
  const r = asRec(result);

  switch (tool) {
    case "analyse_audience": {
      const count = asNum(r.count) ?? 0;
      const breakdown = Array.isArray(r.personaBreakdown) ? (r.personaBreakdown as AnyRec[]) : [];
      const top = [...breakdown].sort((a, b) => (asNum(b.count) ?? 0) - (asNum(a.count) ?? 0))[0];
      const persona = top ? asStr(top.persona) : null;
      const avgLtv = asNum(r.avgLtv);
      const who = persona ? `${count} ${persona}` : `${count}`;
      return `${who} customers${avgLtv !== null ? ` · avg LTV ${inr(avgLtv)}` : ""}`;
    }

    case "get_past_performance": {
      const channels = Array.isArray(r.channels) ? (r.channels as AnyRec[]) : [];
      if (!channels.length) return "no past campaigns yet";
      const sorted = [...channels].sort((a, b) => (asNum(b.convertRate) ?? 0) - (asNum(a.convertRate) ?? 0));
      const top2 = sorted
        .slice(0, 2)
        .map((c) => `${asStr(c.channel) ?? "?"} ${asNum(c.convertRate) ?? 0}%`)
        .join(" · ");
      return `convert: ${top2} · best = ${asStr(sorted[0].channel) ?? "?"}`;
    }

    case "draft_message": {
      const goal = asStr(args.goal) ?? "marketing";
      const persona = asStr(args.persona);
      const tone = asStr(args.tone);
      return `${goal} copy${persona ? ` for ${persona}` : ""}${tone ? ` · ${tone} tone` : ""}`;
    }

    case "propose_campaign": {
      const name = asStr(r.name) ?? "campaign";
      return `‘${name}’ → ready to approve`;
    }

    default:
      return "done";
  }
}
