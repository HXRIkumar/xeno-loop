import type { Channel } from "@prisma/client";

export type ChannelSend = {
  communicationId: string;
  recipient: string;
  message: string;
  channel: Channel;
};

// Strip trailing slash(es) so `${url}/send/batch` can't become `…//send/batch` (which 404s).
const CHANNEL_SERVICE_URL = (process.env.CHANNEL_SERVICE_URL ?? "http://localhost:4000").replace(/\/+$/, "");

// Cold-start tolerance (free-tier hosts sleep ~50s); env-tunable so an always-on host dials them down.
const WAKE_MAX_WAIT_MS = Number(process.env.CHANNEL_WAKE_MAX_WAIT_MS ?? 50000);
const WAKE_PING_TIMEOUT_MS = Number(process.env.CHANNEL_WAKE_PING_TIMEOUT_MS ?? 8000);
const SEND_TIMEOUT_MS = Number(process.env.CHANNEL_SEND_TIMEOUT_MS ?? 15000);
const SEND_RETRIES = Number(process.env.CHANNEL_SEND_RETRIES ?? 2);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Surface the classic prod misconfig: dispatching to localhost from a deployed function. */
function warnIfMisconfigured() {
  const deployed = !!process.env.VERCEL || process.env.NODE_ENV === "production";
  if (deployed && /localhost|127\.0\.0\.1/.test(CHANNEL_SERVICE_URL)) {
    console.error(
      `[fire] CHANNEL_SERVICE_URL is "${CHANNEL_SERVICE_URL}" in a deployed environment — ` +
        `set it to your Render channel-service URL in Vercel (Production AND Preview scopes).`
    );
  }
}

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
 * Wake a possibly-sleeping channel service by polling /health until it answers (bounded, with
 * backoff), so the batch send hits a warm instance. Returns true once ready; logs if it never does.
 */
export async function wakeChannel(): Promise<boolean> {
  warnIfMisconfigured();
  const healthUrl = `${CHANNEL_SERVICE_URL}/health`;
  const deadline = Date.now() + WAKE_MAX_WAIT_MS;
  let attempt = 0;
  while (Date.now() < deadline) {
    try {
      const res = await fetchWithTimeout(healthUrl, { method: "GET" }, WAKE_PING_TIMEOUT_MS);
      if (res.ok) {
        if (attempt > 0) console.log(`[fire] channel awake after ${attempt + 1} ping(s) → ${healthUrl}`);
        return true;
      }
    } catch {
      /* asleep / waking / aborted — keep polling */
    }
    attempt++;
    await sleep(Math.min(3000, 750 * attempt));
  }
  console.error(`[fire] channel /health unreachable within ${WAKE_MAX_WAIT_MS}ms → ${healthUrl}`);
  return false;
}

/**
 * Hand a campaign's sends to the channel service. Logs the exact URL + response so a misconfig is
 * visible (not silent), normalizes the URL, retries with backoff, and throws on total failure (the
 * caller treats that as a recoverable, re-fireable dispatch failure). The service 202-accepts.
 */
export async function sendBatchToChannel(sends: ChannelSend[]): Promise<{ accepted: number; queued: number }> {
  const url = `${CHANNEL_SERVICE_URL}/send/batch`;
  console.log(`[fire] POST ${url} — dispatching ${sends.length} send(s)`);
  let lastErr: unknown;
  for (let attempt = 0; attempt <= SEND_RETRIES; attempt++) {
    try {
      const res = await fetchWithTimeout(
        url,
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sends }) },
        SEND_TIMEOUT_MS
      );
      const body = await res.text();
      if (res.ok) {
        console.log(`[fire] channel accepted ${res.status}: ${body.slice(0, 200)}`);
        return JSON.parse(body) as { accepted: number; queued: number };
      }
      console.error(
        `[fire] channel REJECTED ${res.status} from ${url}: ${body.slice(0, 300)}` +
          (res.status === 404
            ? ` — a 404 means CHANNEL_SERVICE_URL is pointing at the wrong service; GET ${CHANNEL_SERVICE_URL}/ ` +
              `should return the channel-service endpoint list.`
            : "")
      );
      lastErr = new Error(`channel responded ${res.status}`);
    } catch (e) {
      console.error(
        `[fire] channel send error (attempt ${attempt + 1}/${SEND_RETRIES + 1}) → ${url}:`,
        e instanceof Error ? e.message : e
      );
      lastErr = e;
    }
    if (attempt < SEND_RETRIES) await sleep(1500 * (attempt + 1));
  }
  throw lastErr ?? new Error("channel send failed");
}
