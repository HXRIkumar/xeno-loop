import Link from "next/link";
import { Users, IndianRupee, MoonStar, ShoppingBag, ArrowRight, Sparkles } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { PERSONA_LABEL, PERSONAS } from "@/lib/display";
import { inr } from "@/lib/utils";
import { getOpportunities } from "@/lib/agent/opportunities";

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
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="h-4 w-4" />
          <span className="text-xs uppercase tracking-wide">{label}</span>
        </div>
        <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
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
    getOpportunities(),
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

      <div className="space-y-6 p-8">
        {/* Opportunities Loop spotted in the data — click to have the agent propose one */}
        {opportunities.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-primary" />
              Opportunities Loop spotted
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {opportunities.map((o) => (
                <Card key={o.id} className="flex flex-col border-primary/20">
                  <CardContent className="flex flex-1 flex-col gap-2 p-5">
                    <div className="font-medium">{o.title}</div>
                    <p className="flex-1 text-sm text-muted-foreground">{o.description}</p>
                    <div className="text-xs font-medium text-primary">{o.metric}</div>
                    <Link
                      href={`/loop?prompt=${encodeURIComponent(o.prompt)}`}
                      className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                    >
                      Ask Loop to build this <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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
          <CardContent className="p-6">
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
                  <div key={p} className="flex items-center gap-3">
                    <div className="w-32 shrink-0 text-sm">{PERSONA_LABEL[p]}</div>
                    <div className="h-6 flex-1 overflow-hidden rounded-md bg-muted">
                      <div
                        className="flex h-full items-center justify-end rounded-md bg-primary/80 pr-2 text-[11px] font-medium text-primary-foreground"
                        style={{ width: `${(count / maxCount) * 100}%` }}
                      >
                        {count}
                      </div>
                    </div>
                    <div className="w-28 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
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
