import type { SimEvent } from "./simulator";
import type { Channel } from "./config";

export type DeadLetter = {
  communicationId: string;
  channel: Channel;
  event: SimEvent;
  attempts: number;
  lastError: string;
  failedAt: string;
};

export const metrics = {
  sendsAccepted: 0,
  eventsScheduled: 0,
  eventsDeliveredOk: 0,
  eventsRetried: 0,
  eventsDeadLettered: 0,
  byStatus: {} as Record<string, number>,
};

export function countStatus(type: string) {
  metrics.byStatus[type] = (metrics.byStatus[type] ?? 0) + 1;
}

// in-memory dead-letter queue (bounded so a long stress run can't OOM)
export const deadLetter: DeadLetter[] = [];
const MAX_DEAD_LETTER = 500;

export function pushDeadLetter(item: DeadLetter) {
  deadLetter.push(item);
  if (deadLetter.length > MAX_DEAD_LETTER) deadLetter.shift();
}
