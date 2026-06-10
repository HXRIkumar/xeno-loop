import { PageHeader } from "@/components/page-header";
import { AnalyticsView } from "@/components/analytics-view";
import { getInsights } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const insights = await getInsights();
  return (
    <div>
      <PageHeader
        title="Analytics"
        description="Funnel, channel performance, and attributed vs organic revenue."
      />
      <div className="p-8">
        <AnalyticsView {...insights} />
      </div>
    </div>
  );
}
