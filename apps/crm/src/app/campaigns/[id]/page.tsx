import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Users, Sparkles } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { CampaignStatusBadge, ChannelBadge } from "@/components/badges";
import { CampaignActions } from "@/components/campaign-actions";
import { CampaignFunnel } from "@/components/campaign-funnel";
import { CampaignSummary } from "@/components/campaign-summary";
import { Card, CardContent } from "@/components/ui/card";
import { SegmentFilterSchema, describeFilter } from "@/lib/segment";
import { renderMessage } from "@/lib/render";

export const dynamic = "force-dynamic";

type Reasoning = { summary?: string; dataPoints?: string[] } | null;
type Impact = Record<string, number | string> | null;

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) notFound();

  const parsedFilter = SegmentFilterSchema.safeParse(campaign.segmentSnapshotJson);
  const filterDesc = parsedFilter.success ? describeFilter(parsedFilter.data) : "Custom audience";
  const preview = renderMessage(campaign.messageTemplate, {
    name: "Aarav Sharma",
    persona: "Dormant",
    offer: campaign.offer,
  });
  const reasoning = (campaign.reasoningJson as Reasoning) ?? null;
  const impact = (campaign.expectedImpactJson as Impact) ?? null;
  const preFire = campaign.status === "PROPOSED" || campaign.status === "APPROVED";

  return (
    <div>
      <PageHeader title={campaign.name} description={campaign.goal}>
        <div className="flex items-center gap-3">
          <CampaignStatusBadge status={campaign.status} />
          <CampaignActions id={campaign.id} status={campaign.status} />
        </div>
      </PageHeader>

      <div className="space-y-6 p-8">
        <Link
          href="/campaigns"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> All campaigns
        </Link>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardContent className="space-y-4 p-6">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    Audience
                  </span>
                  <ChannelBadge channel={campaign.channel} />
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{campaign.audienceSize}</span> customers ·{" "}
                  <span className="text-muted-foreground">{filterDesc}</span>
                </div>
                <div>
                  <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                    Message preview
                  </div>
                  <div className="rounded-lg border bg-muted/40 p-4 text-sm leading-relaxed">
                    {preview}
                  </div>
                </div>
              </CardContent>
            </Card>

            {preFire ? (
              <Card>
                <CardContent className="p-6 text-sm text-muted-foreground">
                  {campaign.status === "PROPOSED"
                    ? "Awaiting your approval. Nothing has been sent — approve to enable firing."
                    : `Approved and ready. Fire to send to ${campaign.audienceSize} customers and watch the funnel update live.`}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-6">
                  <CampaignFunnel campaignId={campaign.id} />
                </CardContent>
              </Card>
            )}
          </div>

          {/* The explainable proposal — why the agent (or marketer) chose this */}
          <div className="space-y-6">
            {campaign.status === "COMPLETED" && <CampaignSummary campaignId={campaign.id} />}
            {(reasoning?.summary || (reasoning?.dataPoints?.length ?? 0) > 0) && (
              <Card className="border-primary/30 bg-primary/[0.03]">
                <CardContent className="space-y-3 p-6">
                  <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                    <Sparkles className="h-4 w-4" /> Why this campaign
                  </div>
                  {reasoning?.summary && <p className="text-sm leading-relaxed">{reasoning.summary}</p>}
                  {reasoning?.dataPoints && reasoning.dataPoints.length > 0 && (
                    <ul className="space-y-1.5 text-sm text-muted-foreground">
                      {reasoning.dataPoints.map((d, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-primary">·</span>
                          {d}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            )}

            {impact && (
              <Card>
                <CardContent className="space-y-2 p-6">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Expected impact
                  </div>
                  <dl className="space-y-1 text-sm">
                    {Object.entries(impact).map(([k, v]) => (
                      <div key={k} className="flex justify-between">
                        <dt className="text-muted-foreground">{k}</dt>
                        <dd className="font-medium tabular-nums">{String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
