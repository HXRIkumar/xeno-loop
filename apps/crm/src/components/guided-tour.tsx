"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Lightbulb,
  MessageSquareText,
  ShieldCheck,
  Radio,
  TrendingUp,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Step = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  href?: string;
  cta?: string;
};

// The 5-step "How Loop works" walkthrough — mirrors the propose → approve → execute → attribute →
// learn loop, with a deep link into the relevant page at each step.
const STEPS: Step[] = [
  {
    icon: Lightbulb,
    title: "Loop spots opportunities",
    body: "On the dashboard, Loop reads your live customer data and surfaces real, number-backed opportunities — and each card tracks whether you've already acted on it.",
  },
  {
    icon: MessageSquareText,
    title: "Ask the agent to propose a campaign",
    body: "Open Loop and ask. The agent analyses the segment, drafts the message, and proposes a full campaign — audience, channel, and expected impact.",
    href: "/loop",
    cta: "Open Loop",
  },
  {
    icon: ShieldCheck,
    title: "Review the reasoning & approve",
    body: "Loop shows its work — the data it pulled and why it chose this. Nothing sends until you approve. Human-in-the-loop by design.",
  },
  {
    icon: Radio,
    title: "Watch it deliver live & attribute revenue",
    body: "Approved campaigns fire through a real delivery pipeline. Track the funnel live and see attributed revenue land as customers convert.",
    href: "/campaigns",
    cta: "See campaigns",
  },
  {
    icon: TrendingUp,
    title: "Loop learns and recommends smarter",
    body: "Every campaign feeds the learning loop — Loop grows more confident about which channels convert for which customers, and recommends accordingly.",
    href: "/analytics",
    cta: "View analytics",
  },
];

export function GuidedTour({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [step, setStep] = useState(0);
  const s = STEPS[step];
  const Icon = s.icon;
  const last = step === STEPS.length - 1;

  function handleOpenChange(o: boolean) {
    if (!o) setStep(0); // reset so it always opens at step 1
    onOpenChange(o);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* motion-reduce guards respect prefers-reduced-motion */}
      <DialogContent className="max-w-md motion-reduce:animate-none">
        <DialogHeader>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <DialogTitle className="pt-2">{s.title}</DialogTitle>
          <DialogDescription className="leading-relaxed">{s.body}</DialogDescription>
        </DialogHeader>

        {s.href && (
          <Button asChild variant="outline" size="sm" className="w-fit">
            <Link href={s.href} onClick={() => handleOpenChange(false)}>
              {s.cta} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        )}

        <div className="flex items-center justify-between pt-1">
          <div className="flex gap-1.5" aria-hidden>
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={cn("h-1.5 w-1.5 rounded-full", i === step ? "bg-primary" : "bg-muted")}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setStep((x) => x - 1)}>
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </Button>
            )}
            {last ? (
              <Button size="sm" onClick={() => handleOpenChange(false)}>
                Done
              </Button>
            ) : (
              <Button size="sm" onClick={() => setStep((x) => x + 1)}>
                Next <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
        <div className="text-center text-[11px] text-muted-foreground">
          Step {step + 1} of {STEPS.length}
        </div>
      </DialogContent>
    </Dialog>
  );
}
