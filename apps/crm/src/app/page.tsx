import Link from "next/link";
import { Users, IndianRupee, MoonStar, ShoppingBag, ArrowRight, Sparkles } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PERSONA_LABEL, PERSONAS } from "@/lib/display";
import { inr, cn } from "@/lib/utils";
import { getOpportunities } from "@/lib/opportunities-data";

export const dynamic = "force-dynamic";

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="h-4 w-4" />
          <span className="text-xs uppercase tracking-wide">{label}</span>
        </div>
        <div className="mt-2 break-words text-xl font-semibold tabular-nums sm:text-2xl">{value}</div>
        {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const [total, agg, dormant, personaCounts, opportunities] = await Promise.all([
    prisma.customer.count(),
    prisma.customer.aggregate({ _sum: { ltv: true, totalOrders: true } }),
    prisma.customer.count({ where: { persona: "DORMANT" } }),
    prisma.customer.groupBy({ by: ["persona"], _count: true, _sum: { ltv: true } }),
    getOpportunities().catch(() => []),
  ]);

  const totalLtv = agg._sum.ltv ?? 0;
  const totalOrders = agg._sum.totalOrders ?? 0;
  const countByPersona = new Map(personaCounts.map((p) => [p.persona, p._count]));
  const ltvByPersona = new Map(personaCounts.map((p) => [p.persona, p._sum.ltv ?? 0]));
  const maxCount = Math.max(1, ...personaCounts.map((p) => p._count));

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="StyleArc at a glance. Head to Loop to let the agent surface opportunities."
      />

      <div className="space-y-6 p-4 sm:p-8">
        {/* Opportunities Loop spotted in the data — STATEFUL: a card flips to "In progress" then
            "Addressed" once a matching campaign is fired (derived from real campaigns). */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-primary" />
            Opportunities Loop spotted
          </div>
          {opportunities.length === 0 ? (
            <Card>
              <CardContent className="p-5 text-sm text-muted-foreground">
                No open opportunities right now — you&apos;re on top of your segments. Loop will surface
                new ones as the data shifts.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {opportunities.map((o) => {
                const addressed = o.status === "addressed";
                return (
                  <Card key={o.id} className={cn("flex flex-col border-primary/20", addressed && "opacity-70")}>
                    <CardContent className="flex flex-1 flex-col gap-2 p-5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          {o.segmentLabel}
                        </span>
                        {o.status === "in_progress" && <Badge variant="warning">In progress</Badge>}
                        {o.status === "addressed" && <Badge variant="muted">Addressed</Badge>}
                      </div>
                      <div className="font-medium">{o.title}</div>
                      <p className="flex-1 text-sm text-muted-foreground">{o.description}</p>
                      <div className="text-xs font-medium text-primary">
                        {o.metricPrimary} · {o.metricSecondary}
                      </div>
                      {o.status === "open" ? (
                        <Button asChild size="sm" variant="outline" className="mt-1 w-fit">
                          <Link href={`/loop?prompt=${encodeURIComponent(o.suggestedPrompt)}`}>
                            Ask Loop <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      ) : (
                        <span className="mt-1 text-xs text-muted-foreground">
                          {addressed
                            ? "Campaign completed for this segment."
                            : "Campaign in flight for this segment."}
                        </span>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Kpi icon={Users} label="Customers" value={String(total)} />
          <Kpi icon={IndianRupee} label="Lifetime value" value={inr(totalLtv)} />
          <Kpi icon={ShoppingBag} label="Total orders" value={String(totalOrders)} />
          <Kpi
            icon={MoonStar}
            label="Dormant"
            value={String(dormant)}
            hint="win-back candidates"
          />
        </div>

        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Persona distribution
              </h2>
              <Link
                href="/customers"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                View customers <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="space-y-3">
              {PERSONAS.map((p) => {
                const count = countByPersona.get(p) ?? 0;
                return (
                  <div key={p} className="flex items-center gap-2 sm:gap-3">
                    <div className="w-24 shrink-0 truncate text-xs sm:w-32 sm:text-sm">{PERSONA_LABEL[p]}</div>
                    <div className="h-6 min-w-0 flex-1 overflow-hidden rounded-md bg-muted">
                      <div
                        className="flex h-full items-center justify-end rounded-md bg-primary/80 pr-2 text-[11px] font-medium text-primary-foreground"
                        style={{ width: `${(count / maxCount) * 100}%` }}
                      >
                        {count}
                      </div>
                    </div>
                    <div className="w-16 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground sm:w-28 sm:text-xs">
                      {inr(ltvByPersona.get(p) ?? 0)}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
