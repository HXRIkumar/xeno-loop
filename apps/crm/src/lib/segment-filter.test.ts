import { describe, it, expect } from "vitest";
import { buildSegmentFilter, optionalInt } from "./segment-filter";
import type { Persona } from "@prisma/client";

const ALL: Persona[] = ["HIGH_SPENDER", "DORMANT", "NEW", "DISCOUNT_HUNTER", "BRAND_LOYAL"];

describe("buildSegmentFilter — the persona → filter mapping (preview-bug guard)", () => {
  // The regression: a persona-only selection (recency/LTV left blank) must NOT acquire a hidden
  // recency/LTV floor — otherwise non-dormant personas silently preview as 0.
  it("persona-only selection adds NO recency/LTV constraint, for EVERY persona", () => {
    for (const p of ALL) {
      const f = buildSegmentFilter({ personas: [p], minDaysSinceOrder: "", minLtv: "" });
      expect(f).toEqual({ personas: [p] });
      expect(f.minDaysSinceOrder).toBeUndefined();
      expect(f.minLtv).toBeUndefined();
    }
  });

  it("blank / whitespace numeric inputs are omitted entirely", () => {
    expect(buildSegmentFilter({ personas: ["NEW"], minDaysSinceOrder: "  ", minLtv: "" })).toEqual({
      personas: ["NEW"],
    });
  });

  it("includes recency/LTV ONLY when explicitly provided (string or number)", () => {
    expect(
      buildSegmentFilter({ personas: ["DORMANT"], minDaysSinceOrder: "120", minLtv: "10000" })
    ).toEqual({ personas: ["DORMANT"], minDaysSinceOrder: 120, minLtv: 10000 });
    expect(
      buildSegmentFilter({ personas: ["DORMANT"], minDaysSinceOrder: 90, minLtv: 5000 })
    ).toEqual({ personas: ["DORMANT"], minDaysSinceOrder: 90, minLtv: 5000 });
  });

  it("omits personas when none are selected", () => {
    expect(buildSegmentFilter({ personas: [], minDaysSinceOrder: "", minLtv: "" })).toEqual({});
  });

  it("passes the enum value through unchanged (no title-case/space mangling)", () => {
    expect(buildSegmentFilter({ personas: ["HIGH_SPENDER", "BRAND_LOYAL"] }).personas).toEqual([
      "HIGH_SPENDER",
      "BRAND_LOYAL",
    ]);
  });
});

describe("optionalInt", () => {
  it("blank / null / non-numeric → undefined (no constraint)", () => {
    expect(optionalInt("")).toBeUndefined();
    expect(optionalInt("   ")).toBeUndefined();
    expect(optionalInt(null)).toBeUndefined();
    expect(optionalInt(undefined)).toBeUndefined();
    expect(optionalInt("abc")).toBeUndefined();
  });
  it("numeric strings / numbers → truncated int", () => {
    expect(optionalInt("120")).toBe(120);
    expect(optionalInt(90)).toBe(90);
    expect(optionalInt("12.9")).toBe(12);
    expect(optionalInt(0)).toBe(0);
  });
});
