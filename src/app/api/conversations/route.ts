import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId, verifyProjectWriteAccess } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { sanitizeInput } from "@/lib/sanitize-server";
import { ConversationCreateSchema } from "@/schemas/conversations";

export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ error: "projectId required" }, { status: 400 });
    }

    const userId = getCurrentUserId(request);
    const access = await verifyProjectWriteAccess(projectId, userId, request.headers.get("x-user-email"));
    if (!access.authorized) return access.response;

    const conversations = await prisma.conversation.findMany({
      where: { projectId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, updatedAt: true },
    });

    return NextResponse.json({ conversations });
  } catch (error) {
    logger.error("GET /api/conversations error", { projectId: request.nextUrl.searchParams.get("projectId"), error });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let projectId: string | undefined;
  try {
    const body = await request.json();
    const parsed = ConversationCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }

    ({ projectId } = parsed.data);
    const { title } = parsed.data;
    const userId = getCurrentUserId(request);
    const access = await verifyProjectWriteAccess(projectId, userId, request.headers.get("x-user-email"));
    if (!access.authorized) return access.response;

    const conversation = await prisma.conversation.create({
      data: { projectId, title: title ? sanitizeInput(title.trim()) : "New chat" },
      select: { id: true, title: true, updatedAt: true },
    });

    return NextResponse.json(conversation, { status: 201 });
  } catch (error) {
    logger.error("POST /api/conversations error", { projectId, error });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
