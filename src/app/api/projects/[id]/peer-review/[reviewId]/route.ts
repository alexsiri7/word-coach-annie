import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { getCurrentUserId, verifyProjectReadAccess } from "@/lib/api-auth";
import { prisma } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; reviewId: string }> }
) {
  const { id: projectId, reviewId } = await params;
  const userId = getCurrentUserId(request);
  const access = await verifyProjectReadAccess(projectId, userId, request.headers.get("x-user-email"));
  if (!access.authorized) return access.response;

  try {
    const review = await prisma.peerReview.findFirst({
      where: { id: reviewId, projectId },
    });
    if (!review) {
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    }
    return NextResponse.json(review);
  } catch (error) {
    logger.error("GET /api/projects/[id]/peer-review/[reviewId] error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
