import { TimelineClient } from "@/components/timeline/timeline-client";
import { TimelineController } from "@/lib/controllers/timeline";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Timeline View | Word Coach Annie",
};

export default async function TimelinePage({
    params,
}: {
    params: { id: string };
}) {
    const projectId = params.id;
    const timelineData = await TimelineController.getTimelineData(projectId);

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <TimelineClient initialData={timelineData} projectId={projectId} />
        </div>
    );
}
