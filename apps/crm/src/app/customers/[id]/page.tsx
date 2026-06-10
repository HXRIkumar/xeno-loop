import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { PersonaBadge, ChannelBadge } from "@/components/badges";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { inr, relativeDays } from "@/lib/utils";

export const dynamic = "force-dynamic";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: { orders: { orderBy: { createdAt: "desc" } } },
  });

  if (!customer) notFound();

  return (
    <div>
      <PageHeader title={customer.name} description={customer.email}>
        <Link
          href="/customers"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> All customers
        </Link>
      </PageHeader>

      <div className="space-y-6 p-8">
        <div className="flex flex-wrap items-center gap-2">
          <PersonaBadge persona={customer.persona} />
          <span className="text-sm text-muted-foreground">prefers</span>
          <ChannelBadge channel={customer.preferredChannel} />
          <span className="text-sm text-muted-foreground">· {customer.phone}</span>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Lifetime value" value={inr(customer.ltv)} />
          <Stat label="Total orders" value={String(customer.totalOrders)} />
          <Stat label="Last order" value={relativeDays(customer.lastOrderDate)} />
          <Stat
            label="Avg order value"
            value={inr(customer.totalOrders ? customer.ltv / customer.totalOrders : 0)}
          />
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Order history
          </h2>
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Attribution</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customer.orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="text-muted-foreground">
                      {o.createdAt.toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell>{o.category}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {o.channel === "ONLINE" ? "Online" : "Offline"}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {inr(o.amount)}
                    </TableCell>
                    <TableCell>
                      {o.attributedCommunicationId ? (
                        <span className="text-xs font-medium text-primary">
                          Campaign-attributed
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Organic</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {customer.orders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                      No orders yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}
