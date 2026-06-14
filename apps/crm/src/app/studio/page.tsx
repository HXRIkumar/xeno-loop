import { PageHeader } from "@/components/page-header";
import { ContentStudio } from "@/components/content-studio";

export const metadata = { title: "Content Studio · Loop" };

export default function StudioPage() {
  return (
    <div>
      <PageHeader
        title="AI Content Studio"
        description="Generate on-brand StyleArc campaign creative — tap an audience and a channel, no copywriting required."
      />
      <div className="space-y-6 p-4 sm:p-8">
        <div className="mx-auto max-w-2xl">
          <ContentStudio />
        </div>
      </div>
    </div>
  );
}
