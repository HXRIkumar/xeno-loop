import Link from "next/link";
import { Plus, Inbox } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { CampaignStatusBadge, ChannelBadge } from "@/components/badges";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { relativeDays } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      goal: true,
      status: true,
      channel: true,
      audienceSize: true,
      createdAt: true,
    },
  });

  return (
    <div>
      <PageHeader title="Campaigns" description="Propose, approve, fire — and watch the funnel live.">
        <Button asChild>
          <Link href="/campaigns/new">
            <Plus /> New campaign
          </Link>
        </Button>
      </PageHeader>

      <div className="p-4 sm:p-8">
        {campaigns.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card/40 py-20 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground" />
            <div className="text-sm text-muted-foreground">
              No campaigns yet. Build one manually, or let{" "}
              <Link href="/loop" className="font-medium text-primary hover:underline">
                Loop
              </Link>{" "}
              propose one.
            </div>
            <Button asChild variant="outline" className="mt-1">
              <Link href="/campaigns/new">
                <Plus /> New campaign
              </Link>
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead className="text-right">Audience</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link href={`/campaigns/${c.id}`} className="block">
                        <div className="font-medium">{c.name}</div>
                        <div className="line-clamp-1 text-xs text-muted-foreground">{c.goal}</div>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/campaigns/${c.id}`}>
                        <CampaignStatusBadge status={c.status} />
                      </Link>
                    </TableCell>
                    <TableCell>
                      <ChannelBadge channel={c.channel} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{c.audienceSize}</TableCell>
                    <TableCell className="text-muted-foreground">{relativeDays(c.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
