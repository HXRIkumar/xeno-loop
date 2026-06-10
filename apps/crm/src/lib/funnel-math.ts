import type { CommStatus } from "@prisma/client";

export type StatusCounts = Partial<Record<CommStatus, number>>;

export type CumulativeFunnel = {
  total: number;
  queued: number;
  sent: number; // dispatched (incl. FAILED)
  delivered: number;
  opened: number;
  read: number;
  clicked: number;
  converted: number;
  failed: number;
};

/**
 * Status is the FURTHEST stage a communication reached, so each funnel level is the cumulative
 * count at-or-beyond it. A FAILED comm was sent but never delivered → counts toward "sent" only.
 * Pure function — unit-tested independently of the DB.
 */
export function cumulativeFunnel(counts: StatusCounts): CumulativeFunnel {
  const g = (s: CommStatus) => counts[s] ?? 0;
  const total = (Object.values(counts) as number[]).reduce((a, b) => a + (b ?? 0), 0);

  const converted = g("CONVERTED");
  const clicked = converted + g("CLICKED");
  const read = clicked + g("READ");
  const opened = read + g("OPENED");
  const delivered = opened + g("DELIVERED");
  const queued = g("QUEUED");
  const failed = g("FAILED");
  const sent = total - queued;

  return { total, queued, sent, delivered, opened, read, clicked, converted, failed };
}

/** Integer percentage, NaN-safe. */
export function rate(num: number, denom: number): number {
  if (!denom) return 0;
  return Math.round((num / denom) * 100);
}

export type FunnelRates = {
  deliveredRate: number; // of sent
  openRate: number; // of delivered
  readRate: number; // of opened
  clickRate: number; // of read
  convertRate: number; // of sent (overall)
};

/** Stage-relative rates (each vs the prior stage) plus an overall convert rate of sent. */
export function funnelRates(f: CumulativeFunnel): FunnelRates {
  return {
    deliveredRate: rate(f.delivered, f.sent),
    openRate: rate(f.opened, f.delivered),
    readRate: rate(f.read, f.opened),
    clickRate: rate(f.clicked, f.read),
    convertRate: rate(f.converted, f.sent),
  };
}
