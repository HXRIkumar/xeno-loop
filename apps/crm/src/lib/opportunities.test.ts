import { describe, it, expect } from "vitest";
import {
  computeOpportunities,
  OPPORTUNITY_WINDOW_DAYS,
  type OpportunityMetric,
  type OpportunityCampaignSignal,
} from "./opportunities";

const metric = (kind: OpportunityMetric["kind"], count: number, value = 100000): OpportunityMetric => ({
  kind,
  count,
  value,
});
const campaign = (
  personas: string[],
  status: OpportunityCampaignSignal["status"],
  ageDays = 1
): OpportunityCampaignSignal => ({ personas, status, ageDays });

describe("computeOpportunities", () => {
  it("includes only candidates with real data (count > 0) and cites the real numbers", () => {
    const out = computeOpportunities(
      [metric("winback-dormant-highspenders", 33, 506200), metric("reward-brand-loyal", 0)],
      []
    );
    expect(out.map((o) => o.id)).toEqual(["winback-dormant-highspenders"]); // the 0-count one is dropped
    const o = out[0];
    expect(o.metricPrimary).toBe("33 customers");
    expect(o.metricSecondary).toContain("₹5,06,200");
    expect(o.description).toContain("33");
    expect(o.status).toBe("open"); // no campaigns → open
    expect(o.suggestedPrompt).toMatch(/win-back/i);
  });

  it("flips open → in_progress → addressed based on a matching recent campaign", () => {
    const m = [metric("winback-dormant-highspenders", 10)];

    expect(computeOpportunities(m, []).at(0)!.status).toBe("open");
    expect(computeOpportunities(m, [campaign(["DORMANT"], "APPROVED")]).at(0)!.status).toBe("in_progress");
    expect(computeOpportunities(m, [campaign(["DORMANT"], "SENDING")]).at(0)!.status).toBe("in_progress");
    expect(computeOpportunities(m, [campaign(["DORMANT"], "COMPLETED")]).at(0)!.status).toBe("addressed");
  });

  it("COMPLETED wins over SENDING for the same persona (addressed beats in_progress)", () => {
    const out = computeOpportunities(
      [metric("winback-dormant-highspenders", 10)],
      [campaign(["DORMANT"], "SENDING"), campaign(["DORMANT"], "COMPLETED")]
    );
    expect(out[0].status).toBe("addressed");
  });

  it("ignores campaigns that are PROPOSED, FAILED, out of window, or target a different persona", () => {
    const m = [metric("winback-dormant-highspenders", 10)];
    expect(computeOpportunities(m, [campaign(["DORMANT"], "PROPOSED")]).at(0)!.status).toBe("open");
    expect(computeOpportunities(m, [campaign(["DORMANT"], "FAILED")]).at(0)!.status).toBe("open");
    expect(
      computeOpportunities(m, [campaign(["DORMANT"], "COMPLETED", OPPORTUNITY_WINDOW_DAYS + 1)]).at(0)!.status
    ).toBe("open"); // too old
    expect(computeOpportunities(m, [campaign(["NEW"], "COMPLETED")]).at(0)!.status).toBe("open"); // wrong persona
  });

  it("sorts open first and addressed last", () => {
    const out = computeOpportunities(
      [
        metric("winback-dormant-highspenders", 5), // will be addressed
        metric("convert-new-second-order", 5), // open
        metric("reengage-discount-hunters", 5), // in_progress
      ],
      [campaign(["DORMANT"], "COMPLETED"), campaign(["DISCOUNT_HUNTER"], "SENDING")]
    );
    expect(out.map((o) => o.status)).toEqual(["open", "in_progress", "addressed"]);
    expect(out[0].id).toBe("convert-new-second-order");
    expect(out[2].id).toBe("winback-dormant-highspenders");
  });

  it("empty metrics → empty list (never throws)", () => {
    expect(computeOpportunities([], [])).toEqual([]);
  });
});
