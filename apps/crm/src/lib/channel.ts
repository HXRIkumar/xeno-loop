import type { Channel } from "@prisma/client";

export type ChannelSend = {
  communicationId: string;
  recipient: string;
  message: string;
  channel: Channel;
};

const CHANNEL_SERVICE_URL = process.env.CHANNEL_SERVICE_URL ?? "http://localhost:4000";

/**
 * Hand a campaign's sends to the channel service in one batch. The service 202-accepts and
 * enqueues, so this returns fast.
 *
 * At scale this call would be replaced by enqueueing onto BullMQ/SQS from a background job
 * rather than from the request path — firing 50k sends inline would blow the serverless
 * timeout. Here, batching + a fast-acking channel keeps the fire request snappy.
 */
export async function sendBatchToChannel(
  sends: ChannelSend[]
): Promise<{ accepted: number; queued: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${CHANNEL_SERVICE_URL}/send/batch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sends }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`channel service responded ${res.status}`);
    }
    return (await res.json()) as { accepted: number; queued: number };
  } finally {
    clearTimeout(timer);
  }
}
