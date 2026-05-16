import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getCurrentUserId, verifyProjectAccess } from "@/lib/api-auth";

const MAX_SEARCH_QUERY_LENGTH = 200;

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
    const userId = getCurrentUserId(request);
    const access = await verifyProjectAccess(projectId, userId);
    if (!access.authorized) return access.response;

    try {
        const q = request.nextUrl.searchParams.get("q");

        if (!q || q.trim().length === 0) {
            return NextResponse.json(
                { error: "Search query 'q' is required" },
                { status: 400 }
            );
        }
        if (q.length > MAX_SEARCH_QUERY_LENGTH) {
            return NextResponse.json(
                { error: `Search query exceeds maximum length of ${MAX_SEARCH_QUERY_LENGTH} characters` },
                { status: 413 }
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

        // Search scene content — get all scenes, then batch-fetch latest content versions
        const scenes = await prisma.structureNode.findMany({
            where: { projectId, type: "SCENE" },
            select: { id: true, title: true, parentId: true },
        });

        // Batch: get all content versions for all scenes in one query
        const sceneIds = scenes.map((s) => s.id);
        const allVersions = sceneIds.length > 0
            ? await prisma.contentVersion.findMany({
                where: { nodeId: { in: sceneIds } },
                orderBy: { createdAt: "desc" },
                select: { nodeId: true, content: true },
            })
            : [];

        // Build map: nodeId -> latest content (first per nodeId due to orderBy desc)
        const latestContentMap = new Map<string, string>();
        for (const v of allVersions) {
            if (!latestContentMap.has(v.nodeId)) {
                latestContentMap.set(v.nodeId, v.content);
            }
        }

        const sceneResults: {
            type: "scene";
            id: string;
            title: string;
            parentId: string | null;
            snippet: string;
        }[] = [];

        const lowerQuery = query.toLowerCase();
        const matchedSceneIds = new Set<string>();

        for (const scene of scenes) {
            const content = latestContentMap.get(scene.id);

            if (content) {
                const plainText = stripHtml(content);
                if (plainText.toLowerCase().includes(lowerQuery)) {
                    sceneResults.push({
                        type: "scene",
                        id: scene.id,
                        title: scene.title,
                        parentId: scene.parentId,
                        snippet: getSnippet(plainText, query),
                    });
                    matchedSceneIds.add(scene.id);
                }
            }

            // Also match on scene title (use Set for O(1) lookup instead of O(n) .find())
            if (
                scene.title.toLowerCase().includes(lowerQuery) &&
                !matchedSceneIds.has(scene.id)
            ) {
                sceneResults.push({
                    type: "scene",
                    id: scene.id,
                    title: scene.title,
                    parentId: scene.parentId,
                    snippet: `Title match: ${scene.title}`,
                });
                matchedSceneIds.add(scene.id);
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
        logger.error("GET /api/projects/[id]/search error", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
