/**
 * Pure form-inputs → SegmentFilter mapping for the manual campaign builder.
 *
 * Kept in its own prisma-free module so the "use client" New Campaign page can import it (importing
 * lib/segment.ts would pull the Prisma client into the browser bundle).
 *
 * THE CONTRACT (and the fix for the preview bug): a BLANK numeric input adds NO constraint. So
 * selecting a persona and leaving recency/LTV empty previews that persona's REAL count — it is not
 * silently intersected with a leftover "no order in 120 days / LTV ≥ ₹10,000" floor that only
 * dormant high-LTV customers satisfy.
 */
import type { Persona } from "@prisma/client";
import type { SegmentFilter } from "./segment";

/** Parse an optional numeric form input: blank / non-numeric → undefined (no constraint). */
export function optionalInt(v: string | number | null | undefined): number | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  if (s === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

export function buildSegmentFilter(input: {
  personas?: Persona[];
  minDaysSinceOrder?: string | number | null;
  minLtv?: string | number | null;
}): SegmentFilter {
  const f: SegmentFilter = {};
  if (input.personas?.length) f.personas = input.personas;
  const days = optionalInt(input.minDaysSinceOrder);
  if (days !== undefined) f.minDaysSinceOrder = days;
  const ltv = optionalInt(input.minLtv);
  if (ltv !== undefined) f.minLtv = ltv;
  return f;
}
