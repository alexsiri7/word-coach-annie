import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId, verifyProjectWriteAccess } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { exportManuscript } from "@/mcp/tools/export";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  try {
    const userId = getCurrentUserId(request);
    const access = await verifyProjectWriteAccess(projectId, userId, request.headers.get("x-user-email"));
    if (!access.authorized) return access.response;

    const body = await request.json().catch(() => ({}));
    const persona = (body.persona as "editor" | "fan" | "author") ?? "editor";
    const type = `review-${persona}` as "review-editor" | "review-fan" | "review-author";

    const manuscript = await exportManuscript(projectId);
    const wordCount = manuscript.split(/\s+/).filter(Boolean).length;
    if (wordCount < 10) {
      return NextResponse.json({ error: "No manuscript content to review" }, { status: 422 });
    }

    const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const conversation = await prisma.conversation.create({
      data: {
        projectId,
        title: `Editorial Review — ${date}`,
        type,
      },
      select: { id: true },
    });

    return NextResponse.json({ conversationId: conversation.id, manuscriptText: manuscript });
  } catch (error) {
    logger.error("POST /api/projects/[id]/send-to-review error", { projectId, error });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
