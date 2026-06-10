import "dotenv/config";
import express from "express";
import { z } from "zod";
import { CONFIG, CHANNELS, crmProvisionUrl, type Channel } from "./config";
import { Queue, DeliveryWorker, type SendJob } from "./queue";
import { metrics, deadLetter } from "./state";
import { log } from "./logger";

const app = express();
app.use(express.json({ limit: "5mb" }));

const queue = new Queue<SendJob>();
const worker = new DeliveryWorker(queue, CONFIG.workerConcurrency);

const ChannelEnum = z.enum(["WHATSAPP", "SMS", "EMAIL", "RCS"]);
const SendSchema = z.object({
  communicationId: z.string().min(1),
  recipient: z.string().min(1),
  message: z.string().min(1),
  channel: ChannelEnum,
});

function accept(job: SendJob) {
  metrics.sendsAccepted++;
  queue.enqueue(job);
}

// ---- POST /send : accept a single send, 202 immediately, enqueue ----
app.post("/send", (req, res) => {
  const parsed = SendSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "validation failed", issues: parsed.error.flatten() });
  }
  accept(parsed.data);
  worker.notify();
  res.status(202).json({ accepted: true, queued: queue.size });
});

// ---- POST /send/batch : a campaign of N, independent per-recipient timelines ----
const BatchSchema = z.object({ sends: z.array(SendSchema).min(1).max(5000) });
app.post("/send/batch", (req, res) => {
  const parsed = BatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "validation failed", issues: parsed.error.flatten() });
  }
  for (const job of parsed.data.sends) accept(job);
  worker.notify();
  res.status(202).json({ accepted: parsed.data.sends.length, queued: queue.size });
});

// ---- POST /stress?count=N : provision N real comms in the CRM, then drain them ----
app.post("/stress", async (req, res) => {
  const count = Math.max(1, Math.min(5000, Number(req.query.count ?? req.body?.count ?? 1000)));
  try {
    const provisionRes = await fetch(crmProvisionUrl(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ count }),
    });
    if (!provisionRes.ok) {
      const text = await provisionRes.text();
      return res.status(502).json({ error: "CRM provisioning failed", status: provisionRes.status, detail: text.slice(0, 300) });
    }
    const { sends, campaignId } = (await provisionRes.json()) as {
      sends: SendJob[];
      campaignId: string;
    };
    for (const job of sends) accept(job);
    worker.notify();
    log.info("stress test enqueued", { count: sends.length, campaignId });
    res.status(202).json({ accepted: sends.length, campaignId, queued: queue.size });
  } catch (e) {
    res.status(502).json({ error: "could not reach CRM", detail: e instanceof Error ? e.message : String(e) });
  }
});

// ---- GET /dead-letter : receipts that exhausted retries ----
app.get("/dead-letter", (_req, res) => {
  res.json({ count: deadLetter.length, items: deadLetter });
});

// ---- GET /health : queue depth + throughput metrics ----
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    queued: queue.size,
    crmReceiptsUrl: CONFIG.crmReceiptsUrl,
    channels: CHANNELS,
    metrics,
    deadLetterSize: deadLetter.length,
  });
});

app.get("/", (_req, res) => {
  res.json({
    service: "channel-service",
    description: "Simulated channel-aware delivery pipeline.",
    endpoints: ["POST /send", "POST /send/batch", "POST /stress?count=N", "GET /health", "GET /dead-letter"],
  });
});

app.listen(CONFIG.port, () => {
  log.info(`channel-service listening on :${CONFIG.port}`, {
    crmReceiptsUrl: CONFIG.crmReceiptsUrl,
    concurrency: CONFIG.workerConcurrency,
  });
});

export { app };
