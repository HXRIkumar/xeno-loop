/**
 * AI Content Studio — the neutral image-provider contract. Mirrors lib/llm/types.ts: the UI + API
 * talk ONLY to this interface, so a real image model drops in behind the same contract later. For
 * this build the live provider is the curated on-brand library (honestly labelled in the UI).
 */
export type CreativeBrief = {
  channel: "WHATSAPP" | "RCS" | "SMS" | "EMAIL";
  persona?: string; // e.g. "DORMANT", "HIGH_SPENDER"
  theme?: string; // "winback" | "festive" | "discount" | "loyalty" | "new"
  /** Rotation/seed for "Show another". Optional; a real model provider can use it as a seed. */
  nonce?: number;
};

export type GeneratedCreative = {
  imageUrl: string;
  source: "library" | "model";
  caption: string; // suggested on-brand copy line
  altText: string;
  promptUsed: string; // the prompt that produced (or would produce) this creative
};

export interface ImageProvider {
  generate(brief: CreativeBrief): Promise<GeneratedCreative>;
}
