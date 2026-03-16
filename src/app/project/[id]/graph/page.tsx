"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StoryGraph } from "@/components/story-graph";

export default function GraphPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  const router = useRouter();

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-surface-raised flex-shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => router.push(`/project/${projectId}`)}
          aria-label="Back to project"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4 text-text-muted" />
          <h1 className="text-sm font-medium">Story Graph</h1>
        </div>
      </header>
      <div className="flex-1 overflow-hidden">
        <StoryGraph projectId={projectId} />
      </div>
    </div>
  );
}
