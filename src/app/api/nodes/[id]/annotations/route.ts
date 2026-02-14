import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: nodeId } = await params;

    try {
        const annotations = await prisma.annotation.findMany({
            where: { nodeId },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                content: true,
                resolved: true,
                range: true,
                selectedText: true,
                createdAt: true,
                updatedAt: true,
                nodeId: true
            }
        });

        return NextResponse.json(annotations);
    } catch (error) {
        console.error("Failed to fetch annotations:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: nodeId } = await params;

    try {
        const body = await request.json();
        const { content, range, selectedText } = body;

        if (!content) {
            return NextResponse.json(
                { error: "Content is required" },
                { status: 400 }
            );
        }

        const annotation = await prisma.annotation.create({
            data: {
                nodeId,
                content,
                range: range || "",
                selectedText: selectedText || null,
            },
        });

        return NextResponse.json(annotation, { status: 201 });
    } catch (error) {
        console.error("Failed to create annotation:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
