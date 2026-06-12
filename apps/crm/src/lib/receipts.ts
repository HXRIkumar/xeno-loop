/**
 * Receipt ingestion — the CRM side of the callback loop. Idempotent, out-of-order safe.
 *
 * Flow per receipt:
 *   1. Append the event to the log, idempotently (providerEventId is UNIQUE; a duplicate is a
 *      no-op 200 — the channel service retries, so duplicates WILL happen).
 *   2. Re-derive the communication's status from ALL its events (pure reducer).
 *   3. If it just reached CONVERTED, create exactly one attributed Order + roll up the customer's
 *      LTV (idempotent: one order per communication).
 *   4. If the provider marked this the final event, settle the communication; if every
 *      communication in the campaign is settled, mark the campaign COMPLETED.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deriveStatus } from "@/lib/reducer";
import { realisticOrderAmount, pickCategory } from "@/lib/attribution";

// Interactive-transaction bounds. Prisma defaults (timeout 5s, maxWait 2s) are SHORTER than a
// round-trip to a pooled DB over a high-latency link (e.g. Supabase via VPN: ~1s/query), so a
// multi-statement tx expired mid-flight (P2028). Tuned high for high-latency pooled connections;
// override via env if needed. We also keep the tx SMALL (writes only) so it rarely approaches this.
const TX_TIMEOUT_MS = Number(process.env.PRISMA_TX_TIMEOUT_MS ?? 20000);
const TX_MAX_WAIT_MS = Number(process.env.PRISMA_TX_MAX_WAIT_MS ?? 10000);

export type ReceiptInput = {
  communicationId: string;
  providerEventId: string;
  type: Prisma.CommunicationEventCreateInput["type"];
  occurredAt: Date;
  final?: boolean;
};

export type IngestResult =
  | { ok: false; code: "UNKNOWN_COMMUNICATION" }
  | {
      ok: true;
      deduped: boolean;
      status: string;
      converted: boolean;
      settled: boolean;
      campaignCompleted: boolean;
    };

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

export async function ingestReceipt(input: ReceiptInput): Promise<IngestResult> {
  const comm = await prisma.communication.findUnique({
    where: { id: input.communicationId },
    select: { id: true, customerId: true, campaignId: true, status: true, settledAt: true },
  });
  if (!comm) return { ok: false, code: "UNKNOWN_COMMUNICATION" };

  // (1) idempotent append — a duplicate providerEventId means "don't insert twice", NOT "skip the
  // status recompute". If a prior attempt inserted the event but then 500'd before updating status
  // (e.g. a connection-pool timeout under load), the channel service retries the SAME receipt; we
  // must still re-derive so the communication converges to its correct status (self-healing).
  let deduped = false;
  try {
    await prisma.communicationEvent.create({
      data: {
        communicationId: comm.id,
        providerEventId: input.providerEventId,
        type: input.type,
        occurredAt: input.occurredAt,
        final: input.final ?? false,
      },
    });
  } catch (e) {
    if (isUniqueViolation(e)) deduped = true;
    else throw e;
  }

  // (2) re-derive from the full log (always — including on dedup, so retries heal stuck comms)
  const events = await prisma.communicationEvent.findMany({
    where: { communicationId: comm.id },
    select: { type: true, occurredAt: true },
  });
  const derived = deriveStatus(events);
  const isFinal = input.final ?? false;

  let converted = false;
  let campaignCompleted = false;

  // (3) status + settle — a SINGLE atomic write, deliberately NOT inside an interactive transaction,
  // so the common path can never hit the tx timeout. Idempotent: re-applying `derived` is a no-op,
  // and settledAt is set once (only while currently null).
  await prisma.communication.update({
    where: { id: comm.id },
    data: {
      status: derived,
      settledAt: isFinal && comm.settledAt == null ? new Date() : undefined,
    },
  });

  // (4) attributed conversion — only on reaching CONVERTED. Reads run OUTSIDE the tx; only the
  // order.create + customer LTV bump (which MUST be atomic together) run inside a short tx. If the
  // tx fails, the receipt 500s, the channel retries, and the dedup self-heal re-runs this — so it
  // converges (one order per communication, guarded by the existence checks).
  if (derived === "CONVERTED") {
    const existing = await prisma.order.findFirst({
      where: { attributedCommunicationId: comm.id },
      select: { id: true },
    });
    if (!existing) {
      const customer = await prisma.customer.findUnique({
        where: { id: comm.customerId },
        select: { ltv: true, totalOrders: true },
      });
      if (customer) {
        const amount = realisticOrderAmount(customer);
        try {
          await prisma.$transaction(
            async (tx) => {
              // re-check inside the tx so a concurrent/retried receipt can't double-create the order
              const dup = await tx.order.findFirst({
                where: { attributedCommunicationId: comm.id },
                select: { id: true },
              });
              if (dup) return;
              const order = await tx.order.create({
                data: {
                  customerId: comm.customerId,
                  amount,
                  category: pickCategory(),
                  channel: "ONLINE",
                  attributedCommunicationId: comm.id,
                },
              });
              await tx.customer.update({
                where: { id: comm.customerId },
                data: {
                  ltv: { increment: amount },
                  totalOrders: { increment: 1 },
                  lastOrderDate: order.createdAt,
                },
              });
              converted = true;
            },
            { timeout: TX_TIMEOUT_MS, maxWait: TX_MAX_WAIT_MS }
          );
        } catch (e) {
          // a concurrent receipt may have created the order first — that's fine, it's still converted
          if (!isUniqueViolation(e)) throw e;
        }
      }
    }
  }

  // (5) campaign completion — count remaining unsettled OUTSIDE the tx, then a single idempotent
  // updateMany (guarded by status:SENDING, so retries/duplicates flip it at most once).
  if (isFinal) {
    const remaining = await prisma.communication.count({
      where: { campaignId: comm.campaignId, settledAt: null },
    });
    if (remaining === 0) {
      const updated = await prisma.campaign.updateMany({
        where: { id: comm.campaignId, status: "SENDING" },
        data: { status: "COMPLETED" },
      });
      campaignCompleted = updated.count > 0;
    }
  }

  return {
    ok: true,
    deduped,
    status: derived,
    converted,
    settled: isFinal || comm.settledAt != null,
    campaignCompleted,
  };
}
