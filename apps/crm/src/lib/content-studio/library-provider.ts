/**
 * LibraryImageProvider — the LIVE image provider for this build. Picks the best-matching on-brand
 * creative from the curated library (theme → persona → channel, deterministic fallback + rotation)
 * and returns it labelled `source: "library"`. The UI shows an honest badge; a real image model
 * swaps in behind this same ImageProvider interface (see model-provider.ts).
 */
import type { Channel } from "@prisma/client";
import { PERSONA_LABEL, CHANNEL_LABEL } from "@/lib/display";
import type { ImageProvider, CreativeBrief, GeneratedCreative } from "./types";
import { selectCreative } from "./library";

const PUBLIC_PATH = "/content-studio";

export class LibraryImageProvider implements ImageProvider {
  async generate(brief: CreativeBrief): Promise<GeneratedCreative> {
    const { item } = selectCreative(brief);
    const personaLabel = item.persona
      ? (PERSONA_LABEL[item.persona as keyof typeof PERSONA_LABEL] ?? item.persona)
      : null;
    const channelLabel = CHANNEL_LABEL[brief.channel as Channel] ?? brief.channel;
    return {
      imageUrl: `${PUBLIC_PATH}/${item.file}`,
      source: "library",
      caption: item.caption,
      altText: `StyleArc ${item.theme} creative${personaLabel ? ` for ${personaLabel} customers` : ""}`,
      promptUsed: `On-brand StyleArc ${item.theme} creative${personaLabel ? ` for ${personaLabel} customers` : ""}, optimised for ${channelLabel}.`,
    };
  }
}
