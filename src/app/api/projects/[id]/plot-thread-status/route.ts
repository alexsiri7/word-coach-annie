import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { getCurrentUserId, verifyProjectReadAccess } from "@/lib/api-auth";
import { getPlotThreadStatus } from "@/mcp/tools/coaching";

// Re-export types for consumers
export type { PlotlineStatus, PlotlineIndicator, ScenePlotThreadStatus } from "@/mcp/tools/coaching";

/**
 * GET /api/projects/[id]/plot-thread-status
 *
 * Returns plotline status indicators for each scene in story order.
 * Thin wrapper around MCP tool implementation.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const userId = getCurrentUserId(request);
  const access = await verifyProjectReadAccess(projectId, userId, request.headers.get("x-user-email"));
  if (!access.authorized) return access.response;

  try {
    const result = await getPlotThreadStatus(projectId);
    return NextResponse.json(result);
  } catch (error) {
    logger.error("GET /api/projects/[id]/plot-thread-status error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
