import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId, verifyProjectWriteAccessByNode } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { sanitizeInput } from "@/lib/sanitize-server";

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        // Verify access via parent node
        const annotation = await prisma.annotation.findUnique({
            where: { id },
            select: { nodeId: true },
        });
        if (!annotation) {
            return NextResponse.json({ error: "Annotation not found" }, { status: 404 });
        }
        const userId = getCurrentUserId(request);
        const access = await verifyProjectWriteAccessByNode(annotation.nodeId, userId, request.headers.get("x-user-email"));
        if (!access.authorized) return access.response;

        const body = await request.json();
        const { content, resolved } = body;

        const updateData: Record<string, unknown> = {};
        if (content !== undefined) updateData.content = sanitizeInput(content);
        if (resolved !== undefined) updateData.resolved = resolved;

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json(
                { error: "No fields to update" },
                { status: 400 }
            );
        }

        const updated = await prisma.annotation.update({
            where: { id },
            data: updateData,
        });

        return NextResponse.json(updated);
    } catch (error) {
        logger.error("Failed to update annotation", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        // Verify access via parent node
        const annotation = await prisma.annotation.findUnique({
            where: { id },
            select: { nodeId: true },
        });
        if (!annotation) {
            return NextResponse.json({ error: "Annotation not found" }, { status: 404 });
        }
        const userId = getCurrentUserId(request);
        const access = await verifyProjectWriteAccessByNode(annotation.nodeId, userId, request.headers.get("x-user-email"));
        if (!access.authorized) return access.response;

        await prisma.annotation.delete({
            where: { id },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error("Failed to delete annotation", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
