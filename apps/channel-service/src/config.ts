/**
 * One config object holds the CHANNEL-DIFFERENTIATED outcome probabilities. Because the four
 * channels really do behave differently here, "WhatsApp beat SMS for dormant high-LTV" becomes
 * true in the data — so the CRM's channel analytics and the agent's learning loop have genuine
 * signal, not noise. These are illustrative assumptions (documented in the README), tune freely.
 */
export type Channel = "WHATSAPP" | "SMS" | "EMAIL" | "RCS";

export type LifecycleStatus =
  | "QUEUED"
  | "SENT"
  | "DELIVERED"
  | "OPENED"
  | "READ"
  | "CLICKED"
  | "CONVERTED"
  | "FAILED";

export type ChannelProfile = {
  delivered: number; // P(delivered | sent)
  opened: number; // P(opened | delivered)
  readOfOpened: number; // P(read | opened)
  clickedOfRead: number; // P(clicked | read)
  convertedOfClicked: number; // P(converted | clicked)
};

export const CHANNEL_PROFILES: Record<Channel, ChannelProfile> = {
  WHATSAPP: { delivered: 0.92, opened: 0.8, readOfOpened: 0.7, clickedOfRead: 0.3, convertedOfClicked: 0.12 },
  SMS: { delivered: 0.97, opened: 0.55, readOfOpened: 0.6, clickedOfRead: 0.12, convertedOfClicked: 0.1 },
  EMAIL: { delivered: 0.88, opened: 0.4, readOfOpened: 0.65, clickedOfRead: 0.18, convertedOfClicked: 0.11 },
  RCS: { delivered: 0.9, opened: 0.7, readOfOpened: 0.68, clickedOfRead: 0.25, convertedOfClicked: 0.12 },
};

export const CHANNELS: Channel[] = ["WHATSAPP", "SMS", "EMAIL", "RCS"];

// each lifecycle event is POSTed back after a random delay in this band → events arrive
// OUT OF ORDER, exercising the CRM's reducer.
export const EVENT_DELAY_MIN_MS = 2000;
export const EVENT_DELAY_MAX_MS = 10000;

// exponential backoff schedule for the receipt callback (4 retries).
export const RETRY_BACKOFFS_MS = [500, 1000, 2000, 4000];

export const CONFIG = {
  port: Number(process.env.PORT ?? 4000),
  crmReceiptsUrl: process.env.CRM_RECEIPTS_URL ?? "http://localhost:3000/api/receipts",
  // generous per-receipt timeout: a high-latency pooled DB (e.g. Supabase over a hotspot) can take
  // seconds per receipt; aborting at 5s caused needless retries → dead-letters. 12s lets it land.
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS ?? 12000),
  workerConcurrency: Number(process.env.WORKER_CONCURRENCY ?? 8),
  // cap concurrent in-flight receipt callbacks so a burst can't exhaust the CRM's DB connection
  // pool. At scale this is the rate-limit/backpressure you'd put on a webhook fan-out.
  receiptConcurrency: Number(process.env.RECEIPT_CONCURRENCY ?? 10),
};

/** Derive the CRM origin from the receipts URL so /stress can provision real communications. */
export function crmProvisionUrl(): string {
  try {
    const u = new URL(CONFIG.crmReceiptsUrl);
    return `${u.origin}/api/stress`;
  } catch {
    return "http://localhost:3000/api/stress";
  }
}
