import { NextRequest, NextResponse } from "next/server";
import { ProgressController } from "@/lib/controllers/progress";
import { logger } from "@/lib/logger";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  try {
    const progress = await ProgressController.getProjectProgress(projectId);
    return NextResponse.json(progress);
  } catch (error) {
    logger.error("Failed to get project progress", { error, projectId });
    return NextResponse.json({ error: "Failed to get progress" }, { status: 500 });
  }
}
