"use client";

import { useState } from "react";
import Link from "next/link";
import { Sparkles, Bot, Radio, Image as ImageIcon, X, PlayCircle, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuidedTour } from "@/components/guided-tour";

/**
 * First-load capability hero (Feature 2.1) — announces that Loop is an AI product and links to its
 * three pillars, so a first-time reviewer discovers the agent and the Content Studio. Dismissible
 * (React state only — no browser storage); when dismissed it collapses to a slim bar that still
 * offers the tour, so the announcement + "How it works" stay one click away and replayable.
 */
const TILES = [
  { icon: Bot, title: "Agentic campaigns", body: "Loop proposes, you approve, it executes & learns.", href: "/loop" },
  { icon: Radio, title: "Real delivery pipeline", body: "Live funnel, retries, revenue attribution.", href: "/campaigns" },
  {
    icon: ImageIcon,
    title: "AI Content Studio",
    body: "On-brand campaign creative in one tap.",
    href: "/studio",
  },
];

export function CapabilityHero() {
  const [dismissed, setDismissed] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);

  return (
    <>
      <GuidedTour open={tourOpen} onOpenChange={setTourOpen} />

      {dismissed ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/[0.03] px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 shrink-0 text-primary" />
            <span className="font-medium">Loop</span>
            <span className="text-muted-foreground">— your AI marketing co-pilot</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setTourOpen(true)}>
            <PlayCircle className="h-4 w-4" /> How it works
          </Button>
        </div>
      ) : (
        <Card className="relative overflow-hidden border-primary/20 bg-primary/[0.03]">
          <CardContent className="p-5 sm:p-6">
            <button
              onClick={() => setDismissed(true)}
              aria-label="Dismiss"
              className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <Sparkles className="h-4 w-4" /> Loop — your AI marketing co-pilot
            </div>
            <p className="mt-1 max-w-2xl pr-6 text-sm text-muted-foreground">
              Loop reads your live customer data, proposes a full campaign with its reasoning shown,
              executes it through a real delivery pipeline, attributes the revenue, and learns for next
              time.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {TILES.map((t) => {
                const Icon = t.icon;
                return (
                  <Link
                    key={t.title}
                    href={t.href}
                    className="group rounded-lg border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-accent"
                  >
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Icon className="h-4 w-4 shrink-0 text-primary" /> {t.title}
                      <ArrowRight className="ml-auto h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{t.body}</p>
                  </Link>
                );
              })}
            </div>

            <div className="mt-4">
              <Button variant="outline" size="sm" onClick={() => setTourOpen(true)}>
                <PlayCircle className="h-4 w-4" /> Take the tour
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
