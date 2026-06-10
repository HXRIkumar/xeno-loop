// Central place for human labels + stable colors for the domain enums, so every screen
// (table badges, funnel, charts) reads consistently.
import type { Persona, Channel, CommStatus, CampaignStatus } from "@prisma/client";

export const PERSONA_LABEL: Record<Persona, string> = {
  HIGH_SPENDER: "High Spender",
  DORMANT: "Dormant",
  NEW: "New",
  DISCOUNT_HUNTER: "Discount Hunter",
  BRAND_LOYAL: "Brand Loyal",
};

export const PERSONAS: Persona[] = [
  "HIGH_SPENDER",
  "DORMANT",
  "NEW",
  "DISCOUNT_HUNTER",
  "BRAND_LOYAL",
];

export const CHANNELS: Channel[] = ["WHATSAPP", "SMS", "EMAIL", "RCS"];

export const CHANNEL_LABEL: Record<Channel, string> = {
  WHATSAPP: "WhatsApp",
  SMS: "SMS",
  EMAIL: "Email",
  RCS: "RCS",
};

// CSS var hue per channel (defined in globals.css) — used by charts.
export const CHANNEL_COLOR: Record<Channel, string> = {
  WHATSAPP: "var(--channel-whatsapp)",
  SMS: "var(--channel-sms)",
  EMAIL: "var(--channel-email)",
  RCS: "var(--channel-rcs)",
};

// The funnel order (also the reducer's rank order). FAILED handled separately.
export const FUNNEL_STAGES: CommStatus[] = [
  "QUEUED",
  "SENT",
  "DELIVERED",
  "OPENED",
  "READ",
  "CLICKED",
  "CONVERTED",
];

export const COMM_STATUS_LABEL: Record<CommStatus, string> = {
  QUEUED: "Queued",
  SENT: "Sent",
  DELIVERED: "Delivered",
  OPENED: "Opened",
  READ: "Read",
  CLICKED: "Clicked",
  CONVERTED: "Converted",
  FAILED: "Failed",
};

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  PROPOSED: "Proposed",
  APPROVED: "Approved",
  SENDING: "Sending",
  COMPLETED: "Completed",
  FAILED: "Failed",
};
