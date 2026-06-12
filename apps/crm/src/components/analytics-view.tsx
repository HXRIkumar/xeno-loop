"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChannelBadge } from "@/components/badges";
import { inr } from "@/lib/utils";
import { CHANNEL_LABEL, CHANNEL_COLOR, PERSONA_LABEL } from "@/lib/display";
import type { ChannelStat, PersonaStat, CampaignStat } from "@/lib/analytics";
import type { CumulativeFunnel, FunnelRates } from "@/lib/funnel-math";
import type { Channel, Persona } from "@prisma/client";

type Props = {
  channels: ChannelStat[];
  funnel: CumulativeFunnel & { rates: FunnelRates };
  personas: PersonaStat[];
  revenue: {
    attributedRevenue: number;
    organicRevenue: number;
    totalRevenue: number;
    attributedShare: number;
  };
  monthly: { month: string; attributed: number; organic: number }[];
  campaigns: CampaignStat[];
  headline: string;
};

const shortInr = (n: number) => (n >= 1000 ? `₹${Math.round(n / 1000)}k` : `₹${n}`);
const CHART_VARS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <div className="mb-4">
          <h3 className="text-sm font-semibold">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

export function AnalyticsView({ channels, funnel, personas, revenue, monthly, campaigns, headline }: Props) {
  const funnelData = [
    { stage: "Sent", count: funnel.sent },
    { stage: "Delivered", count: funnel.delivered },
    { stage: "Opened", count: funnel.opened },
    { stage: "Read", count: funnel.read },
    { stage: "Clicked", count: funnel.clicked },
    { stage: "Converted", count: funnel.converted },
  ];
  const channelData = channels.map((c) => ({
    channel: CHANNEL_LABEL[c.channel as Channel],
    raw: c.channel as Channel,
    convertRate: c.convertRate,
    attributedRevenue: c.attributedRevenue,
  }));
  const personaData = personas.map((p) => ({
    persona: PERSONA_LABEL[p.persona as Persona],
    customers: p.customers,
  }));
  const hasSends = funnel.sent > 0;

  return (
    <div className="space-y-6">
      {/* learning-loop headline */}
      <div className="rounded-xl border border-primary/30 bg-primary/[0.04] px-5 py-4 text-sm">
        <span className="font-semibold text-primary">What Loop has learned: </span>
        {headline}
      </div>

      {/* revenue split */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Total revenue" value={inr(revenue.totalRevenue)} />
        <Stat label="Attributed" value={inr(revenue.attributedRevenue)} hint={`${revenue.attributedShare}% of revenue`} />
        <Stat label="Organic" value={inr(revenue.organicRevenue)} />
        <Stat label="Converted comms" value={String(funnel.converted)} hint={`${funnel.rates.convertRate}% of sent`} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* channel performance — the headline */}
        <Panel
          title="Channel performance"
          subtitle="Convert rate (line) and attributed revenue (bars) — real differences from the channel-aware pipeline."
        >
          {hasSends ? (
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={channelData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="channel" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="rev" tickFormatter={shortInr} tick={{ fontSize: 11 }} />
                <YAxis yAxisId="rate" orientation="right" unit="%" tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value, name) =>
                    name === "attributedRevenue"
                      ? [inr(Number(value)), "Attributed revenue"]
                      : [`${Number(value)}%`, "Convert rate"]
                  }
                />
                <Bar yAxisId="rev" dataKey="attributedRevenue" radius={[4, 4, 0, 0]}>
                  {channelData.map((d) => (
                    <Cell key={d.raw} fill={CHANNEL_COLOR[d.raw]} />
                  ))}
                </Bar>
                <Line yAxisId="rate" dataKey="convertRate" stroke="var(--foreground)" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </Panel>

        {/* overall funnel */}
        <Panel title="Delivery funnel" subtitle="Cumulative across all fired campaigns.">
          {hasSends ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={funnelData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </Panel>

        {/* persona distribution */}
        <Panel title="Persona distribution" subtitle="Customers by persona.">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={personaData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis dataKey="persona" tick={{ fontSize: 10 }} interval={0} angle={-12} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="customers" radius={[4, 4, 0, 0]}>
                {personaData.map((_, i) => (
                  <Cell key={i} fill={CHART_VARS[i % CHART_VARS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        {/* revenue over time */}
        <Panel title="Revenue over time" subtitle="Monthly attributed vs organic (last 12 months).">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={monthly} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={(m: string) => m.slice(2)} />
              <YAxis tickFormatter={shortInr} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => inr(Number(value))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="organic" name="Organic" stroke="var(--chart-4)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="attributed" name="Attributed" stroke="var(--primary)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      {/* channel table — precise numbers */}
      <Panel title="Channel breakdown" subtitle="The exact numbers behind the chart.">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Channel</TableHead>
              <TableHead className="text-right">Sent</TableHead>
              <TableHead className="text-right">Delivered</TableHead>
              <TableHead className="text-right">Opened</TableHead>
              <TableHead className="text-right">Clicked</TableHead>
              <TableHead className="text-right">Convert %</TableHead>
              <TableHead className="text-right">Attributed ₹</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {channels.map((c) => (
              <TableRow key={c.channel}>
                <TableCell>
                  <ChannelBadge channel={c.channel as Channel} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{c.sent}</TableCell>
                <TableCell className="text-right tabular-nums">{c.delivered}</TableCell>
                <TableCell className="text-right tabular-nums">{c.opened}</TableCell>
                <TableCell className="text-right tabular-nums">{c.clicked}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{c.convertRate}%</TableCell>
                <TableCell className="text-right tabular-nums">{inr(c.attributedRevenue)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      </Panel>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-1 break-words text-xl font-semibold tabular-nums sm:text-2xl">{value}</div>
        {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
      Fire a campaign to populate this.
    </div>
  );
}
