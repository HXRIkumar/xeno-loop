import { CONFIG, RETRY_BACKOFFS_MS, type Channel } from "./config";
import type { SimEvent } from "./simulator";
import { log } from "./logger";
import { metrics, countStatus, pushDeadLetter } from "./state";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Bounded-concurrency gate: at most CONFIG.receiptConcurrency receipt callbacks are in flight at
// once. Event timers fire unbounded (one per lifecycle stage); without this, a campaign-sized
// burst stampedes the CRM and exhausts its DB connection pool. Backpressure here keeps the callback
// rate at what the CRM can actually serve.
let inFlight = 0;
const waiters: Array<() => void> = [];
async function acquireSlot(): Promise<void> {
  if (inFlight < CONFIG.receiptConcurrency) {
    inFlight++;
    return;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  inFlight++;
}
function releaseSlot(): void {
  inFlight--;
  waiters.shift()?.();
}

/** 4xx (except 408/429) won't change on retry — don't waste attempts. */
function isRetryable(status: number): boolean {
  if (status >= 500) return true;
  if (status === 408 || status === 429) return true;
  return false;
}

async function postOnce(communicationId: string, event: SimEvent): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.requestTimeoutMs);
  try {
    return await fetch(CONFIG.crmReceiptsUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        communicationId,
        providerEventId: event.providerEventId,
        type: event.type,
        occurredAt: event.occurredAt,
        final: event.final,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Deliver one receipt to the CRM with up to 4 retries on transient failure (exp backoff
 * 0.5/1/2/4s). A permanent 4xx or exhausted retries → dead-letter (so nothing is silently lost).
 */
export async function deliverReceipt(
  communicationId: string,
  channel: Channel,
  event: SimEvent
): Promise<void> {
  await acquireSlot();
  try {
  let attempt = 0;
  let lastError = "";

  while (attempt <= RETRY_BACKOFFS_MS.length) {
    try {
      const res = await postOnce(communicationId, event);
      if (res.ok) {
        metrics.eventsDeliveredOk++;
        countStatus(event.type);
        return;
      }
      lastError = `HTTP ${res.status}`;
      if (!isRetryable(res.status)) {
        log.warn("receipt rejected (permanent)", { communicationId, type: event.type, status: res.status });
        break;
      }
    } catch (e) {
      lastError = e instanceof Error ? (e.name === "AbortError" ? "timeout" : e.message) : "network error";
    }

    if (attempt < RETRY_BACKOFFS_MS.length) {
      const backoff = RETRY_BACKOFFS_MS[attempt];
      metrics.eventsRetried++;
      log.warn("receipt failed, retrying", { communicationId, type: event.type, attempt: attempt + 1, backoffMs: backoff, error: lastError });
      await sleep(backoff);
    }
    attempt++;
  }

  // exhausted / permanent → dead-letter
  metrics.eventsDeadLettered++;
  pushDeadLetter({
    communicationId,
    channel,
    event,
    attempts: attempt,
    lastError,
    failedAt: new Date().toISOString(),
  });
  log.error("receipt dead-lettered", { communicationId, type: event.type, lastError });
  } finally {
    releaseSlot();
  }
}
