import type { Channel } from "@prisma/client";

export type ChannelSend = {
  communicationId: string;
  recipient: string;
  message: string;
  channel: Channel;
};

const CHANNEL_SERVICE_URL = process.env.CHANNEL_SERVICE_URL ?? "http://localhost:4000";

// Cold-start tolerance: a free-tier host (e.g. Render) sleeps after idle and takes ~50s to wake.
// These are env-tunable so a paid/always-on host can dial them down.
const WAKE_MAX_WAIT_MS = Number(process.env.CHANNEL_WAKE_MAX_WAIT_MS ?? 50000); // total budget to wake
const WAKE_PING_TIMEOUT_MS = Number(process.env.CHANNEL_WAKE_PING_TIMEOUT_MS ?? 8000); // per /health ping
const SEND_TIMEOUT_MS = Number(process.env.CHANNEL_SEND_TIMEOUT_MS ?? 15000); // per /send/batch attempt
const SEND_RETRIES = Number(process.env.CHANNEL_SEND_RETRIES ?? 2);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Wake the channel service before sending. On a sleeping free-tier instance the first request
 * triggers a cold start (~50s); we poll /health until it answers (each ping bounded, with backoff)
 * so the subsequent batch send hits a warm instance instead of aborting. Returns true once ready.
 * On an always-on host the first ping returns instantly.
 */
export async function wakeChannel(): Promise<boolean> {
  const deadline = Date.now() + WAKE_MAX_WAIT_MS;
  let attempt = 0;
  while (Date.now() < deadline) {
    try {
      const res = await fetchWithTimeout(`${CHANNEL_SERVICE_URL}/health`, { method: "GET" }, WAKE_PING_TIMEOUT_MS);
      if (res.ok) return true;
    } catch {
      /* asleep / waking / aborted — keep polling; the request itself nudges the cold start along */
    }
    attempt++;
    await sleep(Math.min(3000, 750 * attempt));
  }
  return false;
}

/**
 * Hand a campaign's sends to the channel service in one batch. Resilient: a generous per-attempt
 * timeout + retry-with-backoff so a brief cold start / blip doesn't abort the whole fire. The
 * service 202-accepts and enqueues, so a warm call returns fast. Throws if every attempt fails —
 * the caller (fireCampaign) treats that as a recoverable, re-fireable dispatch failure.
 *
 * At scale this call would enqueue onto BullMQ/SQS from a background job rather than the request
 * path; here, batching + wake + retry keeps the fire request robust.
 */
export async function sendBatchToChannel(sends: ChannelSend[]): Promise<{ accepted: number; queued: number }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= SEND_RETRIES; attempt++) {
    try {
      const res = await fetchWithTimeout(
        `${CHANNEL_SERVICE_URL}/send/batch`,
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sends }) },
        SEND_TIMEOUT_MS
      );
      if (res.ok) return (await res.json()) as { accepted: number; queued: number };
      lastErr = new Error(`channel service responded ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    if (attempt < SEND_RETRIES) await sleep(1500 * (attempt + 1));
  }
  throw lastErr ?? new Error("channel send failed");
}
