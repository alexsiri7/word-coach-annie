import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: nodeId } = await params;

  try {
    const node = await prisma.structureNode.findUnique({
      where: { id: nodeId },
      select: { id: true, type: true },
    });

    if (!node) {
      return NextResponse.json({ error: "Node not found" }, { status: 404 });
    }

    const versions = await prisma.contentVersion.findMany({
      where: { nodeId },
      orderBy: { createdAt: "desc" },
    });

    if (versions.length === 0) {
      return NextResponse.json({
        latest: null,
        history: [],
      });
    }

    const latest = versions[0];
    const history = versions.map((v) => ({
      id: v.id,
      wordCount: v.wordCount,
      createdAt: v.createdAt,
    }));

    return NextResponse.json({ latest, history });
  } catch (error) {
    console.error("Failed to get content:", error);
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
    const node = await prisma.structureNode.findUnique({
      where: { id: nodeId },
      select: { id: true, type: true },
    });

    if (!node) {
      return NextResponse.json({ error: "Node not found" }, { status: 404 });
    }

    const body = await request.json();
    const { content } = body;

    if (content === undefined || content === null) {
      return NextResponse.json(
        { error: "content is required" },
        { status: 400 }
      );
    }

    if (typeof content !== "string") {
      return NextResponse.json(
        { error: "content must be a string" },
        { status: 400 }
      );
    }

    const wordCount = content.trim() === "" ? 0 : content.trim().split(/\s+/).length;

    const version = await prisma.contentVersion.create({
      data: {
        nodeId,
        content,
        wordCount,
      },
    });

    return NextResponse.json(version, { status: 201 });
  } catch (error) {
    console.error("Failed to save content:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
