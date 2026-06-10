import { randomUUID } from "crypto";
import {
  CHANNEL_PROFILES,
  EVENT_DELAY_MIN_MS,
  EVENT_DELAY_MAX_MS,
  type Channel,
  type LifecycleStatus,
} from "./config";

export type SimEvent = {
  providerEventId: string;
  type: LifecycleStatus;
  occurredAt: string; // ISO — TRUE chronological order (monotonic)
  final: boolean;
  delayMs: number; // when to POST it (random) → arrivals are OUT OF ORDER
};

const rand = () => Math.random();
const between = (min: number, max: number) => min + Math.random() * (max - min);

/**
 * Roll the channel's probabilities to decide how far this message gets through the funnel,
 * then materialise one event per reached stage. occurredAt is monotonic (real order); each
 * event's delayMs is independently random, so the POSTs land out of order.
 */
export function buildTimeline(channel: Channel): SimEvent[] {
  const p = CHANNEL_PROFILES[channel];

  const stages: LifecycleStatus[] = ["SENT"];
  if (rand() < p.delivered) {
    stages.push("DELIVERED");
    if (rand() < p.opened) {
      stages.push("OPENED");
      if (rand() < p.readOfOpened) {
        stages.push("READ");
        if (rand() < p.clickedOfRead) {
          stages.push("CLICKED");
          if (rand() < p.convertedOfClicked) {
            stages.push("CONVERTED");
          }
        }
      }
    }
  } else {
    stages.push("FAILED"); // never delivered — terminal
  }

  const base = Date.now();
  let cursor = base;
  return stages.map((type, i) => {
    cursor += Math.round(between(150, 1500)); // realistic gap between stages
    return {
      providerEventId: randomUUID(),
      type,
      occurredAt: new Date(cursor).toISOString(),
      final: i === stages.length - 1,
      delayMs: Math.round(between(EVENT_DELAY_MIN_MS, EVENT_DELAY_MAX_MS)),
    };
  });
}
