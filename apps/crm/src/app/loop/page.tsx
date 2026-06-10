import { PageHeader } from "@/components/page-header";
import { ChatPanel } from "@/components/chat-panel";

export const dynamic = "force-dynamic";

export default async function LoopPage({
  searchParams,
}: {
  searchParams: Promise<{ prompt?: string }>;
}) {
  const { prompt } = await searchParams;
  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Loop"
        description="The AI co-pilot. It proposes campaigns with its reasoning shown — you approve."
      />
      <div className="min-h-0 flex-1">
        <div className="mx-auto h-full max-w-3xl">
          <ChatPanel initialPrompt={prompt} />
        </div>
      </div>
    </div>
  );
}
