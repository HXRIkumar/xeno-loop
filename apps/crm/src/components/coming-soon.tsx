import { PageHeader } from "@/components/page-header";

export function ComingSoon({
  title,
  description,
  note,
}: {
  title: string;
  description: string;
  note: string;
}) {
  return (
    <div>
      <PageHeader title={title} description={description} />
      <div className="p-8">
        <div className="rounded-xl border border-dashed bg-card/40 p-10 text-center text-sm text-muted-foreground">
          {note}
        </div>
      </div>
    </div>
  );
}
