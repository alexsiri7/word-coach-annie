import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { getCurrentUserId, verifyProjectReadAccess, verifyProjectWriteAccess } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { runPeerReview, MANUSCRIPT_EMPTY, AI_NOT_CONFIGURED } from "@/lib/ai/peer-review-service";

export type { ReviewFeedback, ConsensusFeedback } from "@/lib/ai/peer-review-service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const userId = getCurrentUserId(request);
  const access = await verifyProjectWriteAccess(projectId, userId, request.headers.get("x-user-email"));
  if (!access.authorized) return access.response;

  try {
    const result = await runPeerReview(projectId, userId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === MANUSCRIPT_EMPTY || message === AI_NOT_CONFIGURED) {
      return NextResponse.json({ warning: message });
    }
    logger.error("POST /api/projects/[id]/peer-review error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const userId = getCurrentUserId(request);
  const access = await verifyProjectReadAccess(projectId, userId, request.headers.get("x-user-email"));
  if (!access.authorized) return access.response;

  try {
    const { searchParams } = request.nextUrl;
    const rawLimit = parseInt(searchParams.get("limit") || "20", 10) || 20;
    const limit = Math.min(Math.max(rawLimit, 1), 100);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10) || 0, 0);

    const [rows, total] = await Promise.all([
      prisma.peerReview.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        select: { id: true, createdAt: true, consensus: true },
        take: limit,
        skip: offset,
      }),
      prisma.peerReview.count({ where: { projectId } }),
    ]);

    const data = rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      synthesizedRecommendation:
        (r.consensus as { synthesizedRecommendation?: string } | null)?.synthesizedRecommendation ?? "",
    }));

    return NextResponse.json({ data, total, limit, offset });
  } catch (error) {
    logger.error("GET /api/projects/[id]/peer-review error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
