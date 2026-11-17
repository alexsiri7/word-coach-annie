import { TimelineClient } from "@/components/timeline/timeline-client";
import { TimelineController } from "@/lib/controllers/timeline";
import { verifyProjectReadAccess } from "@/lib/api-auth";
import { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
    title: "Timeline",
};

export default async function TimelinePage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const projectId = id;
    const headersList = await headers();
    const access = await verifyProjectReadAccess(
        projectId,
        headersList.get("x-user-id"),
        headersList.get("x-user-email"),
    );
    if (!access.authorized) notFound();

    const timelineData = await TimelineController.getTimelineData(projectId, {
        excludeOutlineScenes: access.role === "READER",
    });

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <TimelineClient initialData={timelineData} projectId={projectId} />
        </div>
    );
}
