"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronRight, Loader2, RefreshCw, Sparkles, Wrench, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentTrace as Trace, StepEntry, StepStatus } from "@/lib/agent/trace";

/**
 * The Agent Activity Trace — a clean vertical feed of the agent's reasoning + every tool call.
 * Live during a run (expanded, steps resolve from "running…" to their result); collapsible after
 * as "Show agent steps (N)". Reused verbatim on a past proposal's page (static, collapsed).
 * Purely presentational — it renders whatever ordered trace it's handed; it has no provider knowledge.
 */

const TOOL_LABEL: Record<string, string> = {
  analyse_audience: "Analyse audience",
  get_past_performance: "Check past performance",
  draft_message: "Draft message",
  propose_campaign: "Propose campaign",
  model: "Model",
};

const toolLabel = (tool: string) => TOOL_LABEL[tool] ?? tool;

function fmtMs(ms: number | null): string {
  if (ms == null) return "";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/** Compact, single-line render of the tool args (primitives + arrays only), truncated. */
function fmtArgs(args: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(args)) {
    if (v == null || v === "") continue;
    if (Array.isArray(v)) parts.push(`${k}=${v.join("/")}`);
    else if (typeof v !== "object") parts.push(`${k}=${String(v)}`);
  }
  const s = parts.join(" · ");
  return s.length > 72 ? s.slice(0, 71) + "…" : s;
}

function StatusIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case "running":
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />;
    case "retrying":
      return <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-500" />;
    case "recovered":
      return <Check className="h-3.5 w-3.5 text-amber-500" />;
    case "error":
      return <X className="h-3.5 w-3.5 text-destructive" />;
    default:
      return <Check className="h-3.5 w-3.5 text-success" />;
  }
}

function StepRow({ step }: { step: StepEntry }) {
  const isModel = step.tool === "model"; // a provider re-sample (retry/recovered)
  const argStr = fmtArgs(step.args);
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
        <StatusIcon status={step.status} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={cn("text-sm font-medium", isModel && "text-amber-600 dark:text-amber-500")}>
            {toolLabel(step.tool)}
          </span>
          {argStr && <span className="truncate font-mono text-[11px] text-muted-foreground">{argStr}</span>}
          {step.ms != null && (
            <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">{fmtMs(step.ms)}</span>
          )}
        </div>
        {step.status !== "running" && step.resultSummary && (
          <div className={cn("text-xs leading-snug", step.status === "error" ? "text-destructive" : "text-muted-foreground")}>
            {step.resultSummary}
          </div>
        )}
      </div>
    </div>
  );
}

export function AgentTrace({
  entries,
  live = false,
  defaultOpen,
}: {
  entries: Trace;
  live?: boolean;
  defaultOpen?: boolean;
}) {
  const stepCount = entries.filter((e) => e.kind === "step").length;
  // null = user hasn't toggled → fall back to: expanded while live, else `defaultOpen`. While live
  // the toggle is disabled, so it's always expanded; once finished the user can collapse/expand.
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = userOpen !== null ? userOpen : live || (defaultOpen ?? false);

  if (entries.length === 0 && !live) return null;

  return (
    <div className="overflow-hidden rounded-xl border bg-muted/30">
      <button
        type="button"
        onClick={() => !live && setUserOpen(!open)}
        disabled={live}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-muted-foreground",
          !live && "hover:text-foreground"
        )}
      >
        {live ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        ) : open ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        <Wrench className="h-3.5 w-3.5" />
        {live ? "Agent working…" : open ? `Agent steps (${stepCount})` : `Show agent steps (${stepCount})`}
      </button>

      {open && (
        <div className="space-y-0.5 border-t px-3 py-1.5">
          {entries.map((e, i) =>
            e.kind === "reasoning" ? (
              <div key={i} className="flex items-start gap-2.5 py-1">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/60" />
                <p className="text-xs italic leading-relaxed text-muted-foreground">{e.text}</p>
              </div>
            ) : (
              <StepRow key={i} step={e} />
            )
          )}
        </div>
      )}
    </div>
  );
}
