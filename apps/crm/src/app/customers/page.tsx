import Link from "next/link";
import { Prisma, type Persona } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { CustomersFilter } from "@/components/customers-filter";
import { PersonaBadge, ChannelBadge } from "@/components/badges";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { inr, relativeDays } from "@/lib/utils";
import { PERSONAS } from "@/lib/display";

export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; persona?: string }>;
}) {
  const { q, persona } = await searchParams;

  const where: Prisma.CustomerWhereInput = {};
  if (persona && (PERSONAS as string[]).includes(persona)) {
    where.persona = persona as Persona;
  }
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
    ];
  }

  const customers = await prisma.customer.findMany({
    where,
    orderBy: { ltv: "desc" },
    take: 500,
  });

  return (
    <div>
      <PageHeader
        title="Customers"
        description={`${customers.length} StyleArc customers${
          persona || q ? " matching your filters" : ""
        }, sorted by lifetime value.`}
      >
        <CustomersFilter />
      </PageHeader>

      <div className="p-4 sm:p-8">
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Persona</TableHead>
                <TableHead className="text-right">LTV</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead>Last order</TableHead>
                <TableHead>Prefers</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((c) => (
                <TableRow key={c.id} className="cursor-pointer">
                  <TableCell>
                    <Link href={`/customers/${c.id}`} className="block">
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c.email}</div>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`/customers/${c.id}`}>
                      <PersonaBadge persona={c.persona} />
                    </Link>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {inr(c.ltv)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {c.totalOrders}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {relativeDays(c.lastOrderDate)}
                  </TableCell>
                  <TableCell>
                    <ChannelBadge channel={c.preferredChannel} />
                  </TableCell>
                </TableRow>
              ))}
              {customers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-16 text-center text-muted-foreground">
                    No customers match those filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
