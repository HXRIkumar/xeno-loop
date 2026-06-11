/**
 * Server-only trace bus. A request-scoped AsyncLocalStorage carries the live event emitter + a
 * monotonic step counter, so code deep in the call stack (the loop, or an adapter mid-retry) can
 * emit into the SAME stream WITHOUT threading a callback through the LLMProvider interface.
 *
 * Split out from the pure `trace.ts` because this imports `node:async_hooks` — keeping it separate
 * means the client can import `trace.ts` (types + applyTraceEvent) without pulling in node APIs.
 * All emit* helpers are no-ops outside `withTrace`, so untraced callers (e.g. unit tests) are
 * unaffected and the trace layer stays provider-agnostic.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { AgentEvent, StepEntry } from "./trace";

type TraceStore = { emit: (e: AgentEvent) => void; counter: { n: number } };
const als = new AsyncLocalStorage<TraceStore>();

/** Run `fn` with a live trace emitter in scope. Outside this, all emit* helpers are no-ops. */
export function withTrace<T>(emit: (e: AgentEvent) => void, fn: () => Promise<T>): Promise<T> {
  return als.run({ emit, counter: { n: 0 } }, fn);
}

/** A globally-unique, monotonic step id within the current run (0 when no trace is active). */
export function nextStepId(): number {
  const store = als.getStore();
  if (!store) return 0;
  return store.counter.n++;
}

/** Emit a step row (running first, then the resolved state — same stepIndex). No-op if untraced. */
export function emitStep(step: Omit<StepEntry, "kind">): void {
  als.getStore()?.emit({ type: "step", step: { kind: "step", ...step } });
}

/** Emit the model's between-step narration. No-op if untraced. */
export function emitReasoning(text: string): void {
  if (text && text.trim()) als.getStore()?.emit({ type: "reasoning", text });
}
