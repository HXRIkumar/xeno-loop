import { buildTimeline } from "./simulator";
import { deliverReceipt } from "./receipts-client";
import { metrics } from "./state";
import { log } from "./logger";
import type { Channel } from "./config";

export type SendJob = {
  communicationId: string;
  recipient: string;
  message: string;
  channel: Channel;
};

/** Plain in-memory FIFO. At scale this is BullMQ/SQS — see README tradeoffs. */
export class Queue<T> {
  private items: T[] = [];
  enqueue(item: T) {
    this.items.push(item);
  }
  dequeue(): T | undefined {
    return this.items.shift();
  }
  get size() {
    return this.items.length;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const between = (min: number, max: number) => min + Math.random() * (max - min);

/**
 * Long-running worker that drains the queue with BOUNDED CONCURRENCY. Per job it models a small
 * "accept" latency, then schedules the message's lifecycle events as independent timers — so the
 * receipt callbacks fire over the next few seconds and arrive out of order. A persistent worker
 * like this is exactly what serverless is bad at (no place to hold the queue or the timers) —
 * the reason the delivery pipeline is its own service.
 */
export class DeliveryWorker {
  private active = 0;
  constructor(
    private queue: Queue<SendJob>,
    private concurrency: number
  ) {}

  /** Call after enqueuing to wake the pump. */
  notify() {
    this.pump();
  }

  private pump() {
    while (this.active < this.concurrency && this.queue.size > 0) {
      const job = this.queue.dequeue()!;
      this.active++;
      this.process(job).finally(() => {
        this.active--;
        this.pump();
      });
    }
  }

  private async process(job: SendJob) {
    await sleep(between(5, 25)); // simulated channel-accept latency
    const timeline = buildTimeline(job.channel);
    metrics.eventsScheduled += timeline.length;

    for (const ev of timeline) {
      setTimeout(() => {
        void deliverReceipt(job.communicationId, job.channel, ev);
      }, ev.delayMs);
    }

    log.info("message sent → lifecycle scheduled", {
      communicationId: job.communicationId,
      channel: job.channel,
      events: timeline.map((e) => e.type).join(">"),
    });
  }
}
