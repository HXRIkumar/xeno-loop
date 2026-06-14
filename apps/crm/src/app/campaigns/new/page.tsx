"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Users, Loader2, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ChannelRecommendation } from "@/components/channel-recommendation";
import { ContentStudio, CreativeThumb } from "@/components/content-studio";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PERSONAS, PERSONA_LABEL, CHANNELS, CHANNEL_LABEL } from "@/lib/display";
import { inr } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { buildSegmentFilter } from "@/lib/segment-filter";
import type { GeneratedCreative } from "@/lib/content-studio";
import type { Persona, Channel } from "@prisma/client";

type Preview = {
  count: number;
  avgLtv: number;
  totalLtv: number;
  sample: { id: string; name: string; persona: Persona; ltv: number }[];
};

export default function NewCampaignPage() {
  const router = useRouter();

  const [name, setName] = useState("Win back our dormant high-spenders");
  const [goal, setGoal] = useState("Re-engage lapsed high-LTV customers before they churn");
  const [channel, setChannel] = useState<Channel>("WHATSAPP");
  const [personas, setPersonas] = useState<Persona[]>(["DORMANT"]);
  // start recency/LTV BLANK — pre-filling them silently AND-ed every persona preview with a
  // dormancy + ₹10k floor, so only dormant high-LTV customers ever showed (the preview bug).
  const [minDays, setMinDays] = useState("");
  const [minLtv, setMinLtv] = useState("");
  const [template, setTemplate] = useState(
    "Hi {name}, we've missed you at StyleArc! Here's {offer} on your next order — picked just for you."
  );
  const [offer, setOffer] = useState("20% off");

  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Content Studio creative attached to this campaign — presentation-only for now (shown in the
  // preview). Persisting it would need an optional Campaign column; noted as a follow-up in BUILD-LOG.
  const [creative, setCreative] = useState<GeneratedCreative | null>(null);

  function buildFilter() {
    return buildSegmentFilter({ personas, minDaysSinceOrder: minDays, minLtv });
  }

  async function runPreview() {
    setPreviewing(true);
    setError(null);
    try {
      const res = await fetch("/api/segments/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildFilter()),
      });
      if (res.ok) setPreview(await res.json());
      else setError("Could not preview audience");
    } finally {
      setPreviewing(false);
    }
  }

  async function create() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          goal,
          channel,
          filter: buildFilter(),
          messageTemplate: template,
          offer: offer || null,
        }),
      });
      if (!res.ok) {
        setError("Could not create campaign");
        return;
      }
      const { id } = await res.json();
      router.push(`/campaigns/${id}`);
    } finally {
      setCreating(false);
    }
  }

  function togglePersona(p: Persona) {
    setPersonas((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  }

  return (
    <div>
      <PageHeader title="New campaign" description="Build an audience, write the message, propose it." />
      <div className="space-y-6 p-8">
        <Link
          href="/campaigns"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> All campaigns
        </Link>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* form */}
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardContent className="space-y-4 p-6">
                <div className="space-y-1.5">
                  <Label>Campaign name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Goal</Label>
                  <Input value={goal} onChange={(e) => setGoal(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Channel</Label>
                  <Select value={channel} onValueChange={(v) => setChannel(v as Channel)}>
                    <SelectTrigger className="w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CHANNELS.map((c) => (
                        <SelectItem key={c} value={c}>
                          {CHANNEL_LABEL[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* Loop's confidence-aware channel advice — grounded in real past performance,
                    persona-aware only for a single-persona audience. Advisory; one-click accept. */}
                <ChannelRecommendation
                  value={channel}
                  onUse={setChannel}
                  persona={personas.length === 1 ? personas[0] : undefined}
                />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-4 p-6">
                <div className="text-sm font-semibold">Audience</div>
                <div className="space-y-1.5">
                  <Label>Personas</Label>
                  <div className="flex flex-wrap gap-2">
                    {PERSONAS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => togglePersona(p)}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                          personas.includes(p)
                            ? "border-primary bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-muted"
                        )}
                      >
                        {PERSONA_LABEL[p]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>No order in (days)</Label>
                    <Input
                      type="number"
                      value={minDays}
                      onChange={(e) => setMinDays(e.target.value)}
                      placeholder="e.g. 120"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Min LTV (₹)</Label>
                    <Input
                      type="number"
                      value={minLtv}
                      onChange={(e) => setMinLtv(e.target.value)}
                      placeholder="e.g. 10000"
                    />
                  </div>
                </div>
                <Button variant="outline" onClick={runPreview} disabled={previewing}>
                  {previewing ? <Loader2 className="animate-spin" /> : <Users />} Preview audience
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-4 p-6">
                <div className="text-sm font-semibold">Message</div>
                <div className="space-y-1.5">
                  <Label>Offer</Label>
                  <Input value={offer} onChange={(e) => setOffer(e.target.value)} placeholder="e.g. 20% off" />
                </div>
                <div className="space-y-1.5">
                  <Label>Template</Label>
                  <Textarea
                    value={template}
                    onChange={(e) => setTemplate(e.target.value)}
                    rows={4}
                  />
                  <p className="text-xs text-muted-foreground">
                    Placeholders: <code>{"{name}"}</code> <code>{"{persona}"}</code>{" "}
                    <code>{"{offer}"}</code>
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* AI Content Studio (Feature 3) — chip-driven, discovery-critical. The nudge introduces
                it; chips pre-select from the campaign's channel + persona so one tap on Generate works. */}
            <div id="content-studio" className="scroll-mt-20 space-y-2">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Add on-brand creative</span> — let Loop
                generate it. No copywriting required.
              </p>
              <ContentStudio
                defaultChannel={channel}
                defaultPersona={personas.length === 1 ? personas[0] : undefined}
                onUse={setCreative}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end">
              <Button onClick={create} disabled={creating}>
                {creating ? <Loader2 className="animate-spin" /> : <Sparkles />} Create proposal
              </Button>
            </div>
          </div>

          {/* live preview */}
          <div>
            <Card className="sticky top-6">
              <CardContent className="space-y-4 p-6">
                {creative && (
                  <div className="space-y-2">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Campaign creative
                    </div>
                    <CreativeThumb key={creative.imageUrl} creative={creative} />
                    <p className="text-xs text-muted-foreground">{creative.caption}</p>
                  </div>
                )}
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Audience preview
                </div>
                {preview ? (
                  <>
                    <div>
                      <div className="text-3xl font-semibold tabular-nums">{preview.count}</div>
                      <div className="text-sm text-muted-foreground">
                        customers · avg LTV {inr(preview.avgLtv)}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      {preview.sample.map((c) => (
                        <div key={c.id} className="flex items-center justify-between text-sm">
                          <span className="truncate">{c.name}</span>
                          <span className="ml-2 shrink-0 text-xs tabular-nums text-muted-foreground">
                            {inr(c.ltv)}
                          </span>
                        </div>
                      ))}
                      {preview.count > preview.sample.length && (
                        <div className="pt-1 text-xs text-muted-foreground">
                          + {preview.count - preview.sample.length} more
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Set your filters and hit <span className="font-medium">Preview audience</span>.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
