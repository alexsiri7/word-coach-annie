import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId, verifyProjectWriteAccess } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { sanitizeInput } from "@/lib/sanitize-server";
import { ConversationUpdateSchema } from "@/schemas/conversations";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let id: string | undefined;
  try {
    ({ id } = await params);
    const body = await request.json();
    const parsed = ConversationUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }

    const conversation = await prisma.conversation.findUnique({ where: { id } });
    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const userId = getCurrentUserId(request);
    const access = await verifyProjectWriteAccess(conversation.projectId, userId, request.headers.get("x-user-email"));
    if (!access.authorized) return access.response;

    const updated = await prisma.conversation.update({
      where: { id },
      data: { title: sanitizeInput(parsed.data.title.trim()) },
      select: { id: true, title: true, updatedAt: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    logger.error("PATCH /api/conversations/[id] error", { id, error });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let id: string | undefined;
  try {
    ({ id } = await params);
    const conversation = await prisma.conversation.findUnique({ where: { id } });
    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const userId = getCurrentUserId(request);
    const access = await verifyProjectWriteAccess(conversation.projectId, userId, request.headers.get("x-user-email"));
    if (!access.authorized) return access.response;

    await prisma.conversation.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("DELETE /api/conversations/[id] error", { id, error });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
