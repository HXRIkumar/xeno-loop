/**
 * The segment filter model — the shared audience language used by the manual builder AND the
 * agent's analyse_audience tool. A filter is stored on a campaign as segmentSnapshotJson and
 * re-resolved at fire time, so the audience is always fresh.
 */
import { Prisma, type Persona, type Channel } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { PERSONA_LABEL, CHANNEL_LABEL } from "@/lib/display";
import { inr } from "@/lib/utils";

export const SegmentFilterSchema = z
  .object({
    personas: z
      .array(z.enum(["HIGH_SPENDER", "DORMANT", "NEW", "DISCOUNT_HUNTER", "BRAND_LOYAL"]))
      .optional(),
    // recency, measured in days since last order:
    minDaysSinceOrder: z.number().int().min(0).max(1000).optional(), // "dormant for ≥ N days"
    maxDaysSinceOrder: z.number().int().min(0).max(1000).optional(), // "active within N days"
    minLtv: z.number().int().min(0).optional(),
    maxLtv: z.number().int().min(0).optional(),
    minOrders: z.number().int().min(0).optional(), // frequency
    maxOrders: z.number().int().min(0).optional(),
    preferredChannel: z.enum(["WHATSAPP", "SMS", "EMAIL", "RCS"]).optional(),
  })
  .strict();

export type SegmentFilter = z.infer<typeof SegmentFilterSchema>;

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);

/** Translate a SegmentFilter into a Prisma where-clause over Customer. */
export function buildCustomerWhere(f: SegmentFilter): Prisma.CustomerWhereInput {
  const where: Prisma.CustomerWhereInput = {};

  if (f.personas?.length) where.persona = { in: f.personas as Persona[] };
  if (f.preferredChannel) where.preferredChannel = f.preferredChannel as Channel;

  if (f.minLtv != null || f.maxLtv != null) {
    where.ltv = { ...(f.minLtv != null && { gte: f.minLtv }), ...(f.maxLtv != null && { lte: f.maxLtv }) };
  }
  if (f.minOrders != null || f.maxOrders != null) {
    where.totalOrders = {
      ...(f.minOrders != null && { gte: f.minOrders }),
      ...(f.maxOrders != null && { lte: f.maxOrders }),
    };
  }
  // recency on lastOrderDate: "≥ minDays since order" → ordered on/before (now - minDays)
  if (f.minDaysSinceOrder != null || f.maxDaysSinceOrder != null) {
    const lastOrderDate: Prisma.DateTimeNullableFilter = {};
    if (f.minDaysSinceOrder != null) lastOrderDate.lte = daysAgo(f.minDaysSinceOrder);
    if (f.maxDaysSinceOrder != null) lastOrderDate.gte = daysAgo(f.maxDaysSinceOrder);
    where.lastOrderDate = lastOrderDate;
  }
  return where;
}

export type SegmentPreview = {
  count: number;
  avgLtv: number;
  totalLtv: number;
  sample: {
    id: string;
    name: string;
    persona: Persona;
    ltv: number;
    totalOrders: number;
    lastOrderDate: Date | null;
    preferredChannel: Channel;
  }[];
  personaBreakdown: { persona: Persona; count: number }[];
};

/** Count + stats + a small sample for a filter. Reused by the API preview and the agent tool. */
export async function previewSegment(filter: SegmentFilter): Promise<SegmentPreview> {
  const where = buildCustomerWhere(filter);
  const [count, agg, sample, grouped] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.aggregate({ where, _avg: { ltv: true }, _sum: { ltv: true } }),
    prisma.customer.findMany({
      where,
      take: 8,
      orderBy: { ltv: "desc" },
      select: {
        id: true,
        name: true,
        persona: true,
        ltv: true,
        totalOrders: true,
        lastOrderDate: true,
        preferredChannel: true,
      },
    }),
    prisma.customer.groupBy({ by: ["persona"], where, _count: true }),
  ]);

  return {
    count,
    avgLtv: Math.round(agg._avg.ltv ?? 0),
    totalLtv: agg._sum.ltv ?? 0,
    sample,
    personaBreakdown: grouped.map((g) => ({ persona: g.persona, count: g._count })),
  };
}

/** Human-readable description of a filter for cards and proposals. */
export function describeFilter(f: SegmentFilter): string {
  const parts: string[] = [];
  if (f.personas?.length) parts.push(f.personas.map((p) => PERSONA_LABEL[p]).join(" / "));
  else parts.push("All customers");
  if (f.minDaysSinceOrder != null) parts.push(`no order in ${f.minDaysSinceOrder}+ days`);
  if (f.maxDaysSinceOrder != null) parts.push(`active within ${f.maxDaysSinceOrder} days`);
  if (f.minLtv != null) parts.push(`LTV ≥ ${inr(f.minLtv)}`);
  if (f.maxLtv != null) parts.push(`LTV ≤ ${inr(f.maxLtv)}`);
  if (f.minOrders != null) parts.push(`≥ ${f.minOrders} orders`);
  if (f.maxOrders != null) parts.push(`≤ ${f.maxOrders} orders`);
  if (f.preferredChannel) parts.push(`prefers ${CHANNEL_LABEL[f.preferredChannel]}`);
  return parts.join(" · ");
}
