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

  // (1) idempotent append
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
    if (isUniqueViolation(e)) {
      // already ingested — no-op, report current state
      return {
        ok: true,
        deduped: true,
        status: comm.status,
        converted: false,
        settled: comm.settledAt != null,
        campaignCompleted: false,
      };
    }
    throw e;
  }

  // (2) re-derive from the full log
  const events = await prisma.communicationEvent.findMany({
    where: { communicationId: comm.id },
    select: { type: true, occurredAt: true },
  });
  const derived = deriveStatus(events);
  const isFinal = input.final ?? false;

  let converted = false;
  let campaignCompleted = false;

  await prisma.$transaction(async (tx) => {
    // (3) status + settle
    await tx.communication.update({
      where: { id: comm.id },
      data: {
        status: derived,
        settledAt: isFinal && comm.settledAt == null ? new Date() : undefined,
      },
    });

    // (3b) attributed conversion — idempotent (one order per communication)
    if (derived === "CONVERTED") {
      const existing = await tx.order.findFirst({
        where: { attributedCommunicationId: comm.id },
        select: { id: true },
      });
      if (!existing) {
        const customer = await tx.customer.findUniqueOrThrow({
          where: { id: comm.customerId },
          select: { ltv: true, totalOrders: true },
        });
        const amount = realisticOrderAmount(customer);
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
      }
    }

    // (4) campaign completion — when every communication has settled
    if (isFinal) {
      const remaining = await tx.communication.count({
        where: { campaignId: comm.campaignId, settledAt: null },
      });
      if (remaining === 0) {
        const updated = await tx.campaign.updateMany({
          where: { id: comm.campaignId, status: "SENDING" },
          data: { status: "COMPLETED" },
        });
        campaignCompleted = updated.count > 0;
      }
    }
  });

  return {
    ok: true,
    deduped: false,
    status: derived,
    converted,
    settled: isFinal || comm.settledAt != null,
    campaignCompleted,
  };
}
