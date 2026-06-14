/**
 * The curated on-brand creative library + a PURE matcher (no DB, no fs) so it's unit-testable.
 * Files live in `apps/crm/public/content-studio/`; the OWNER supplies the real PNGs after the build
 * (see BUILD-LOG.md for the exact filenames + tags). If a file is missing at runtime the UI renders
 * a tasteful on-brand placeholder (onError) — this module never reads the filesystem.
 */
import type { CreativeBrief } from "./types";

export type CreativeLibraryItem = {
  file: string;
  theme: string;
  persona: string | null;
  channels: string[];
  caption: string;
};

export const CREATIVE_LIBRARY: readonly CreativeLibraryItem[] = [
  { file: "winback-vip-01.png", theme: "winback", persona: "DORMANT", channels: ["WHATSAPP", "RCS"], caption: "We've missed you — here's 20% off your next StyleArc order." },
  { file: "highspender-01.png", theme: "loyalty", persona: "HIGH_SPENDER", channels: ["RCS", "WHATSAPP"], caption: "An exclusive early-access drop, just for you." },
  { file: "new-2nd-purchase-01.png", theme: "new", persona: "NEW", channels: ["WHATSAPP", "EMAIL"], caption: "Loved your first StyleArc piece? Complete the look." },
  { file: "festive-01.png", theme: "festive", persona: null, channels: ["WHATSAPP", "RCS", "EMAIL"], caption: "Festive edit is here — dress for the season." },
  { file: "discount-01.png", theme: "discount", persona: "DISCOUNT_HUNTER", channels: ["SMS", "WHATSAPP"], caption: "Flash sale: your favourites, now 20% off." },
  { file: "dormant-rcs-01.png", theme: "winback", persona: "DORMANT", channels: ["RCS"], caption: "Come back to StyleArc — a little something to welcome you." },
];

const THEME_PTS = 4;
const PERSONA_PTS = 2;
const CHANNEL_PTS = 1;

/** Match score for one item against a brief: theme (4) > persona (2) > channel (1). */
export function scoreCreative(item: CreativeLibraryItem, brief: CreativeBrief): number {
  let score = 0;
  if (brief.theme && item.theme === brief.theme) score += THEME_PTS;
  if (brief.persona && item.persona === brief.persona) score += PERSONA_PTS;
  if (item.channels.includes(brief.channel)) score += CHANNEL_PTS;
  return score;
}

/**
 * Deterministic ranked pool for a brief: the top-scoring matches (theme → persona → channel). If
 * nothing matches at all, fall back to the generic on-brand items (persona === null), else the whole
 * library — so there is ALWAYS a result to show.
 */
export function rankCreatives(brief: CreativeBrief): CreativeLibraryItem[] {
  const scored = CREATIVE_LIBRARY.map((item) => ({ item, score: scoreCreative(item, brief) }));
  const max = Math.max(0, ...scored.map((s) => s.score));
  if (max === 0) {
    const generic = CREATIVE_LIBRARY.filter((it) => it.persona === null);
    return generic.length ? [...generic] : [...CREATIVE_LIBRARY];
  }
  return scored.filter((s) => s.score === max).map((s) => s.item); // library order = deterministic
}

/**
 * Pick one creative for a brief. `matched` is false only when nothing in the library matched (a
 * generic on-brand fallback is returned). `nonce` rotates deterministically among equally-good
 * matches for "Show another".
 */
export function selectCreative(brief: CreativeBrief): { item: CreativeLibraryItem; matched: boolean } {
  const pool = rankCreatives(brief);
  const idx = (((brief.nonce ?? 0) % pool.length) + pool.length) % pool.length;
  const matched = Math.max(0, ...CREATIVE_LIBRARY.map((it) => scoreCreative(it, brief))) > 0;
  return { item: pool[idx], matched };
}
