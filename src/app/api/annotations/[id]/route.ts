import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const body = await request.json();
        const { content, resolved } = body;

        const updateData: Record<string, unknown> = {};
        if (content !== undefined) updateData.content = content;
        if (resolved !== undefined) updateData.resolved = resolved;

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json(
                { error: "No fields to update" },
                { status: 400 }
            );
        }

        const annotation = await prisma.annotation.update({
            where: { id },
            data: updateData,
        });

        return NextResponse.json(annotation);
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
