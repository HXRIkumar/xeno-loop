/**
 * The reconciling state machine — a PURE function at the heart of the receipt loop.
 *
 * The channel service emits lifecycle events at random delays and OUT OF ORDER (a READ can
 * arrive before its DELIVERED; an event can arrive twice). Rather than mutate status on each
 * event (fragile to ordering), we treat the CommunicationEvent log as the source of truth and
 * DERIVE the status from ALL events. Because we take the max rank, out-of-order delivery and
 * duplicates are naturally correct — no special-casing.
 *
 *   QUEUED < SENT < DELIVERED < OPENED < READ < CLICKED < CONVERTED
 *
 * FAILED means "never delivered" and is terminal — UNLESS a positive event proves delivery
 * happened (rank >= DELIVERED), in which case the proof of delivery wins. (Our sim never emits
 * both, but the reducer stays correct if a provider ever did.)
 *
 * Type-only import of CommStatus → this module has ZERO runtime dependencies, so it's trivially
 * unit-testable and could run anywhere.
 */
import type { CommStatus } from "@prisma/client";

export type EventLike = { type: CommStatus; occurredAt?: Date | string };

const RANK: Record<CommStatus, number> = {
  QUEUED: 0,
  SENT: 1,
  DELIVERED: 2,
  OPENED: 3,
  READ: 4,
  CLICKED: 5,
  CONVERTED: 6,
  FAILED: -1, // special — handled explicitly below
};

const DELIVERED_RANK = RANK.DELIVERED;

/** Derive the canonical status of a communication from its full (unordered) event log. */
export function deriveStatus(events: EventLike[]): CommStatus {
  if (events.length === 0) return "QUEUED";

  let maxPositive: CommStatus | null = null;
  let hasFailed = false;

  for (const e of events) {
    if (e.type === "FAILED") {
      hasFailed = true;
      continue;
    }
    if (maxPositive === null || RANK[e.type] > RANK[maxPositive]) {
      maxPositive = e.type;
    }
  }

  const deliveryProven = maxPositive !== null && RANK[maxPositive] >= DELIVERED_RANK;

  // FAILED wins only if nothing proved the message was actually delivered.
  if (hasFailed && !deliveryProven) return "FAILED";

  return maxPositive ?? "QUEUED";
}

/** CONVERTED and FAILED can never advance further — they're intrinsically terminal. */
export function isTerminalStatus(status: CommStatus): boolean {
  return status === "CONVERTED" || status === "FAILED";
}

export { RANK };
