import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function stripHtml(html: string): string {
    return html.replace(/<[^>]+>/g, "").replace(/&[a-zA-Z]+;/g, " ");
}

function getSnippet(text: string, query: string, contextChars: number = 80): string {
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const idx = lowerText.indexOf(lowerQuery);

    if (idx === -1) return text.slice(0, contextChars * 2) + "...";

    const start = Math.max(0, idx - contextChars);
    const end = Math.min(text.length, idx + query.length + contextChars);

    let snippet = "";
    if (start > 0) snippet += "...";
    snippet += text.slice(start, end);
    if (end < text.length) snippet += "...";

    return snippet;
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: projectId } = await params;

    try {
        const q = request.nextUrl.searchParams.get("q");

        if (!q || q.trim().length === 0) {
            return NextResponse.json(
                { error: "Search query 'q' is required" },
                { status: 400 }
            );
        }

        const query = q.trim();

        // Verify project exists
        const project = await prisma.project.findUnique({
            where: { id: projectId },
            select: { id: true },
        });

        if (!project) {
            return NextResponse.json(
                { error: "Project not found" },
                { status: 404 }
            );
        }

        // Search scene content — get all scenes, then get latest content version for each
        const scenes = await prisma.structureNode.findMany({
            where: { projectId, type: "SCENE" },
            select: { id: true, title: true, parentId: true },
        });

        const sceneResults: {
            type: "scene";
            id: string;
            title: string;
            parentId: string | null;
            snippet: string;
        }[] = [];

        const lowerQuery = query.toLowerCase();

        for (const scene of scenes) {
            const latestVersion = await prisma.contentVersion.findFirst({
                where: { nodeId: scene.id },
                orderBy: { createdAt: "desc" },
                select: { content: true },
            });

            if (latestVersion) {
                const plainText = stripHtml(latestVersion.content);
                if (plainText.toLowerCase().includes(lowerQuery)) {
                    sceneResults.push({
                        type: "scene",
                        id: scene.id,
                        title: scene.title,
                        parentId: scene.parentId,
                        snippet: getSnippet(plainText, query),
                    });
                }
            }

            // Also match on scene title
            if (
                scene.title.toLowerCase().includes(lowerQuery) &&
                !sceneResults.find((r) => r.id === scene.id)
            ) {
                sceneResults.push({
                    type: "scene",
                    id: scene.id,
                    title: scene.title,
                    parentId: scene.parentId,
                    snippet: `Title match: ${scene.title}`,
                });
            }
        }

        // Search story objects by name and description
        const storyObjects = await prisma.storyObject.findMany({
            where: { projectId },
            select: { id: true, name: true, type: true, description: true },
        });

        const objectResults: {
            type: "story_object";
            id: string;
            name: string;
            objectType: string;
            snippet: string;
        }[] = [];

        for (const obj of storyObjects) {
            const nameMatch = obj.name.toLowerCase().includes(lowerQuery);
            const descMatch = obj.description.toLowerCase().includes(lowerQuery);

            if (nameMatch || descMatch) {
                objectResults.push({
                    type: "story_object",
                    id: obj.id,
                    name: obj.name,
                    objectType: obj.type,
                    snippet: descMatch
                        ? getSnippet(obj.description, query)
                        : `Name match: ${obj.name}`,
                });
            }
        }

        return NextResponse.json({
            query,
            scenes: sceneResults,
            storyObjects: objectResults,
            totalResults: sceneResults.length + objectResults.length,
        });
    } catch (error) {
        console.error("GET /api/projects/[id]/search error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
