"use client";

import { useRef, useState } from "react";
import { Sparkles, Image as ImageIcon, RefreshCw, Check, ThumbsUp, ThumbsDown, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CHANNELS, CHANNEL_LABEL } from "@/lib/display";
import { cn } from "@/lib/utils";
import type { GeneratedCreative } from "@/lib/content-studio";
import type { Channel, Persona } from "@prisma/client";

/**
 * AI Content Studio — chip-driven (NO manual typing). Tap an audience + a channel, hit Generate, and
 * get on-brand creative + copy via the ImageProvider interface (library by default). The image is
 * served from Loop's curated on-brand library and labelled honestly; a real image model plugs in
 * behind the same interface. Missing image files degrade to a tasteful placeholder (onError).
 */
type ThemeChip = { key: string; label: string; theme: string; persona?: string };

const THEME_CHIPS: ThemeChip[] = [
  { key: "winback", label: "Win-back", theme: "winback", persona: "DORMANT" },
  { key: "highspender", label: "High-spender", theme: "loyalty", persona: "HIGH_SPENDER" },
  { key: "new", label: "New customer", theme: "new", persona: "NEW" },
  { key: "festive", label: "Festive", theme: "festive" },
  { key: "discount", label: "Discount", theme: "discount", persona: "DISCOUNT_HUNTER" },
  { key: "loyalty", label: "Loyalty", theme: "loyalty", persona: "BRAND_LOYAL" },
];

const PERSONA_TO_CHIP: Record<string, string> = {
  DORMANT: "winback",
  HIGH_SPENDER: "highspender",
  NEW: "new",
  DISCOUNT_HUNTER: "discount",
  BRAND_LOYAL: "loyalty",
};

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
      )}
    >
      {children}
    </button>
  );
}

/** The creative image with a graceful on-brand placeholder when the file is missing (onError).
 *  Key it by imageUrl so a new creative resets the failed state. Reused in the builder preview. */
export function CreativeThumb({ creative, className }: { creative: GeneratedCreative; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        className={cn(
          "flex aspect-[4/3] w-full items-center justify-center rounded-lg border bg-gradient-to-br from-primary/20 via-primary/10 to-primary/[0.04]",
          className
        )}
      >
        <div className="px-3 text-center">
          <ImageIcon className="mx-auto h-7 w-7 text-primary/70" />
          <p className="mt-1.5 text-sm font-medium text-primary/80">On-brand creative</p>
          <p className="text-[11px] text-muted-foreground">image pending</p>
        </div>
      </div>
    );
  }
  return (
    // Dynamic library asset; onError swaps to a placeholder (real PNGs dropped in later) — next/image can't fall back on a missing file.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={creative.imageUrl}
      alt={creative.altText}
      onError={() => setFailed(true)}
      className={cn("aspect-[4/3] w-full rounded-lg border object-cover", className)}
    />
  );
}

export function ContentStudio({
  defaultChannel,
  defaultPersona,
  onUse,
  className,
}: {
  defaultChannel?: Channel;
  defaultPersona?: Persona;
  onUse?: (creative: GeneratedCreative) => void;
  className?: string;
}) {
  const [channel, setChannel] = useState<Channel>(defaultChannel ?? "WHATSAPP");
  const [chipKey, setChipKey] = useState<string>((defaultPersona && PERSONA_TO_CHIP[defaultPersona]) || "winback");
  const [creative, setCreative] = useState<GeneratedCreative | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [used, setUsed] = useState(false);
  const [vote, setVote] = useState<"up" | "down" | null>(null);
  const nonceRef = useRef(0);

  async function generate(nonce: number) {
    const chip = THEME_CHIPS.find((c) => c.key === chipKey);
    setLoading(true);
    setError(null);
    setUsed(false);
    setVote(null);
    try {
      const res = await fetch("/api/studio/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channel, theme: chip?.theme, persona: chip?.persona, nonce }),
      });
      if (!res.ok) {
        setError("Couldn't generate creative. Try again.");
        return;
      }
      setCreative((await res.json()) as GeneratedCreative);
    } catch {
      setError("Network error reaching the studio.");
    } finally {
      setLoading(false);
    }
  }

  function handleGenerate() {
    nonceRef.current = 0;
    generate(0);
  }
  function showAnother() {
    nonceRef.current += 1;
    generate(nonceRef.current);
  }
  function handleUse() {
    if (creative && onUse) {
      onUse(creative);
      setUsed(true);
    }
  }

  return (
    <Card className={cn("border-primary/20", className)}>
      <CardContent className="space-y-4 p-5 sm:p-6">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Sparkles className="h-4 w-4" /> AI Content Studio — on-brand creative in one tap
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Tap an audience and a channel, then Generate. No copywriting required.
          </p>
        </div>

        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Audience</div>
          <div className="flex flex-wrap gap-2">
            {THEME_CHIPS.map((c) => (
              <Chip key={c.key} active={chipKey === c.key} onClick={() => setChipKey(c.key)}>
                {c.label}
              </Chip>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Channel</div>
          <div className="flex flex-wrap gap-2">
            {CHANNELS.map((c) => (
              <Chip key={c} active={channel === c} onClick={() => setChannel(c)}>
                {CHANNEL_LABEL[c]}
              </Chip>
            ))}
          </div>
        </div>

        <Button onClick={handleGenerate} disabled={loading} className="w-fit">
          {loading ? <Loader2 className="animate-spin" /> : <Sparkles />} Generate creative
        </Button>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {creative && (
          <div className="space-y-3 rounded-lg border bg-card p-3">
            <CreativeThumb key={creative.imageUrl} creative={creative} />

            <p className="text-sm font-medium">{creative.caption}</p>

            <p className="rounded-md bg-muted px-2.5 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
              Served from Loop&apos;s on-brand library — a live image model plugs in behind this same
              interface in production.
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={showAnother} disabled={loading}>
                <RefreshCw className="h-3.5 w-3.5" /> Show another
              </Button>
              {onUse &&
                (used ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                    <Check className="h-3.5 w-3.5" /> Added to campaign
                  </span>
                ) : (
                  <Button size="sm" onClick={handleUse}>
                    <Check className="h-3.5 w-3.5" /> Use this
                  </Button>
                ))}
              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Good creative"
                  onClick={() => setVote("up")}
                  className={cn("rounded-md p-1.5 hover:bg-muted", vote === "up" ? "text-primary" : "text-muted-foreground")}
                >
                  <ThumbsUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Poor creative"
                  onClick={() => setVote("down")}
                  className={cn("rounded-md p-1.5 hover:bg-muted", vote === "down" ? "text-destructive" : "text-muted-foreground")}
                >
                  <ThumbsDown className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
