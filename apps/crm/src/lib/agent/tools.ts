/**
 * The agent's server-side tools. Each pairs a JSON-Schema spec (sent to the model) with a Zod
 * validator (every tool input is validated before it touches the DB) and an execute fn. Tools
 * read real data and persist proposals — they never fire campaigns (human-in-the-loop).
 */
import { z } from "zod";
import type { ToolSpec } from "@/lib/llm";
import { SegmentFilterSchema, previewSegment, describeFilter } from "@/lib/segment";
import { getInsights } from "@/lib/analytics";
import { getCampaignLearnings } from "@/lib/learnings-data";
import { createCampaign } from "@/lib/campaigns";
import { PERSONA_LABEL } from "@/lib/display";

export type Tool = {
  spec: ToolSpec;
  run: (args: Record<string, unknown>) => Promise<unknown>;
};

const PERSONA_VALUES = ["HIGH_SPENDER", "DORMANT", "NEW", "DISCOUNT_HUNTER", "BRAND_LOYAL"];
const CHANNEL_VALUES = ["WHATSAPP", "SMS", "EMAIL", "RCS"];

function validate<T>(schema: z.ZodType<T>, args: unknown): T {
  const parsed = schema.safeParse(args);
  if (!parsed.success) {
    throw new Error(`invalid tool arguments: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`);
  }
  return parsed.data;
}

// ---------- analyse_audience ----------
const analyseAudience: Tool = {
  spec: {
    name: "analyse_audience",
    description:
      "Count and profile a customer segment from the live DB. Use this to size an audience and see who's in it before proposing a campaign.",
    inputSchema: {
      type: "object",
      properties: {
        personas: { type: "array", items: { type: "string", enum: PERSONA_VALUES }, description: "filter to these personas" },
        minDaysSinceOrder: { type: "number", description: "only customers who haven't ordered in at least this many days (dormancy)" },
        maxDaysSinceOrder: { type: "number", description: "only customers active within this many days" },
        minLtv: { type: "number", description: "minimum lifetime value in INR" },
        maxLtv: { type: "number" },
        minOrders: { type: "number" },
        maxOrders: { type: "number" },
        preferredChannel: { type: "string", enum: CHANNEL_VALUES },
      },
    },
  },
  run: async (args) => {
    const filter = validate(SegmentFilterSchema, args);
    const p = await previewSegment(filter);
    return {
      description: describeFilter(filter),
      count: p.count,
      avgLtv: p.avgLtv,
      totalLtv: p.totalLtv,
      personaBreakdown: p.personaBreakdown.map((b) => ({ persona: PERSONA_LABEL[b.persona], count: b.count })),
      sample: p.sample.map((c) => ({ name: c.name, ltv: c.ltv, orders: c.totalOrders })),
    };
  },
};

// ---------- get_past_performance ----------
const getPastPerformance: Tool = {
  spec: {
    name: "get_past_performance",
    description:
      "Read aggregated outcomes of past campaigns: per-channel convert rates and attributed revenue, plus attributed-vs-organic revenue. Use this to ground channel/audience choices in what actually worked.",
    inputSchema: { type: "object", properties: {} },
  },
  run: async () => {
    const i = await getInsights();
    return {
      headline: i.headline,
      revenue: {
        attributed: i.revenue.attributedRevenue,
        organic: i.revenue.organicRevenue,
        attributedShare: i.revenue.attributedShare,
      },
      channels: i.channels.map((c) => ({
        channel: c.channel,
        sent: c.sent,
        convertRate: c.convertRate,
        attributedRevenue: c.attributedRevenue,
      })),
    };
  },
};

// ---------- get_campaign_learnings (the Learning Loop — PRIMARY grounding for proposals) ----------
const getCampaignLearningsTool: Tool = {
  spec: {
    name: "get_campaign_learnings",
    description:
      "PRIMARY source of truth for what has actually worked, from real fired campaigns: per-channel conversion rates and attributed revenue WITH sample sizes + confidence flags, the best/worst channel, and the strongest persona×channel signal. Call this FIRST and ground your channel choice + reasoning in it. If hasData is false, say there's no history yet and proceed. Supersedes get_past_performance — do NOT also call that.",
    inputSchema: { type: "object", properties: {} },
  },
  run: async () => getCampaignLearnings(),
};

// ---------- draft_message ----------
const DraftSchema = z.object({
  persona: z.string().optional(),
  goal: z.string(),
  tone: z.string().optional(),
  offer: z.string().optional(),
});

const draftMessage: Tool = {
  spec: {
    name: "draft_message",
    description:
      "Draft on-brand StyleArc marketing copy for a persona/goal/tone with {name} and {offer} placeholders. Returns a messageTemplate you can pass to propose_campaign.",
    inputSchema: {
      type: "object",
      properties: {
        persona: { type: "string" },
        goal: { type: "string", description: "what the message should achieve" },
        tone: { type: "string", description: "e.g. warm, urgent, premium, playful" },
        offer: { type: "string", description: "the promo, e.g. '20% off'" },
      },
      required: ["goal"],
    },
  },
  run: async (args) => {
    const { persona, goal, tone, offer } = validate(DraftSchema, args);
    return { messageTemplate: composeCopy({ persona, goal, tone, offer }) };
  },
};

// ---------- propose_campaign (the deliverable; persists PROPOSED) ----------
const ProposeSchema = z.object({
  name: z.string().min(1),
  goal: z.string().min(1),
  segmentFilters: SegmentFilterSchema,
  messageTemplate: z.string().min(1),
  offer: z.string().optional().nullable(),
  channel: z.enum(["WHATSAPP", "SMS", "EMAIL", "RCS"]),
  expectedImpact: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  reasoning: z.object({
    summary: z.string(),
    dataPoints: z.array(z.string()).default([]),
  }),
});

const proposeCampaign: Tool = {
  spec: {
    name: "propose_campaign",
    description:
      "Persist a campaign PROPOSAL (status PROPOSED) for the marketer to approve. ALWAYS include reasoning that cites the real numbers you pulled from analyse_audience / get_past_performance. This NEVER sends anything — the human approves first.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        goal: { type: "string" },
        channel: { type: "string", enum: CHANNEL_VALUES },
        offer: { type: "string", description: "promo substituted into {offer}" },
        messageTemplate: { type: "string", description: "copy with {name}/{offer} placeholders" },
        segmentFilters: {
          type: "object",
          description: "the same audience filter shape as analyse_audience",
          properties: {
            personas: { type: "array", items: { type: "string", enum: PERSONA_VALUES } },
            minDaysSinceOrder: { type: "number" },
            maxDaysSinceOrder: { type: "number" },
            minLtv: { type: "number" },
            maxLtv: { type: "number" },
            minOrders: { type: "number" },
            maxOrders: { type: "number" },
            preferredChannel: { type: "string", enum: CHANNEL_VALUES },
          },
        },
        expectedImpact: {
          type: "object",
          description: "your predicted outcome, e.g. { expectedConversions: 8, expectedRevenue: 32000 }",
        },
        reasoning: {
          type: "object",
          description: "show your work",
          properties: {
            summary: { type: "string", description: "one or two sentences on why this campaign" },
            dataPoints: { type: "array", items: { type: "string" }, description: "bullet facts you pulled" },
          },
          required: ["summary"],
        },
      },
      required: ["name", "goal", "channel", "messageTemplate", "segmentFilters", "reasoning"],
    },
  },
  run: async (args) => {
    const data = validate(ProposeSchema, args);
    const campaign = await createCampaign({
      name: data.name,
      goal: data.goal,
      filter: data.segmentFilters,
      messageTemplate: data.messageTemplate,
      offer: data.offer ?? null,
      channel: data.channel,
      expectedImpact: data.expectedImpact,
      reasoning: data.reasoning,
    });
    return {
      campaignId: campaign.id,
      name: campaign.name,
      audienceSize: campaign.audienceSize,
      channel: campaign.channel,
      status: campaign.status,
      segmentDescription: describeFilter(data.segmentFilters),
      messageTemplate: campaign.messageTemplate,
      reasoning: data.reasoning,
      expectedImpact: data.expectedImpact ?? null,
    };
  },
};

export const TOOLS: Record<string, Tool> = {
  analyse_audience: analyseAudience,
  get_past_performance: getPastPerformance,
  get_campaign_learnings: getCampaignLearningsTool,
  draft_message: draftMessage,
  propose_campaign: proposeCampaign,
};

export const TOOL_LIST: Tool[] = Object.values(TOOLS);
export const TOOL_SPECS: ToolSpec[] = TOOL_LIST.map((t) => t.spec);

// ---------- on-brand copy generator (deterministic; no extra LLM call) ----------
// Returns a template with {name} and {offer} placeholders — the real offer value is stored on
// the campaign and substituted per customer at fire time (see lib/render.ts).
function composeCopy(opts: { persona?: string; goal?: string; tone?: string; offer?: string }): string {
  const tone = (opts.tone ?? "warm").toLowerCase();
  const open = tone.includes("urgent")
    ? "Hi {name}, last chance —"
    : tone.includes("premium")
      ? "Hi {name}, an exclusive just for you:"
      : tone.includes("play")
        ? "Hey {name}! 👀"
        : "Hi {name}, we've been thinking of you —";
  const persona = (opts.persona ?? "").toUpperCase();
  const goal = (opts.goal ?? "").toLowerCase();
  const hook =
    persona.includes("DORMANT") || goal.includes("win") || goal.includes("re-engage")
      ? "it's been a while since your last StyleArc order, and your wardrobe deserves a refresh."
      : persona.includes("HIGH") || persona.includes("LOYAL")
        ? "as one of our favourite customers, you get first look at the new drop."
        : persona.includes("NEW")
          ? "welcome to StyleArc — here's a little something for your next look."
          : "the new StyleArc season just landed, and it's so you.";
  return `${open} ${hook} Enjoy {offer} on your next order — handpicked for your style. Shop now 🛍️`;
}
