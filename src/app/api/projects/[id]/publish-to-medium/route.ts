import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId, verifyProjectAccess } from "@/lib/api-auth";
import { decrypt } from "@/lib/crypto";
import { exportMedium } from "@/mcp/tools/export";
import { logger } from "@/lib/logger";

/**
 * POST /api/projects/[id]/publish-to-medium
 * Body: {
 *   title: string,
 *   publishStatus: "draft" | "public" | "unlisted",
 *   tags?: string[],
 *   canonicalUrl?: string,
 *   nodeId?: string,  // for single article/chapter export
 * }
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: projectId } = await params;
        const userId = getCurrentUserId(request);

        const access = await verifyProjectAccess(projectId, userId);
        if (!access.authorized) return access.response;

        // Get Medium credential
        const cred = await prisma.mediumCredential.findFirst({
            where: userId ? { userId } : {},
        });
        if (!cred) {
            return NextResponse.json(
                { error: "Medium is not connected. Go to Settings to connect your account." },
                { status: 400 }
            );
        }

        const body = await request.json();
        const {
            title,
            publishStatus = "draft",
            tags = [],
            canonicalUrl,
            nodeId,
        } = body;

        if (!title || typeof title !== "string") {
            return NextResponse.json({ error: "title is required" }, { status: 400 });
        }
        if (!["draft", "public", "unlisted"].includes(publishStatus)) {
            return NextResponse.json({ error: "Invalid publishStatus" }, { status: 400 });
        }
        if (Array.isArray(tags) && tags.length > 3) {
            return NextResponse.json({ error: "Maximum 3 tags allowed" }, { status: 400 });
        }

        // Generate content
        const content = await exportMedium(projectId, nodeId);
        if (!content) {
            return NextResponse.json({ error: "No content to publish" }, { status: 400 });
        }

        const token = decrypt(cred.integrationToken);

        // Publish to Medium
        const postRes = await fetch(
            `https://api.medium.com/v1/users/${cred.authorId}/posts`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify({
                    title,
                    contentFormat: "markdown",
                    content,
                    publishStatus,
                    tags: tags.slice(0, 3),
                    ...(canonicalUrl ? { canonicalUrl } : {}),
                }),
            }
        );

        if (!postRes.ok) {
            const errorText = await postRes.text();
            logger.error("Medium publish failed", { status: postRes.status, body: errorText });
            return NextResponse.json(
                { error: `Medium API error: ${postRes.status}` },
                { status: 502 }
            );
        }

        const postData = await postRes.json();
        const mediumPostId: string = postData.data?.id;
        const mediumPostUrl: string = postData.data?.url;

        if (!mediumPostId || !mediumPostUrl) {
            return NextResponse.json({ error: "Unexpected response from Medium" }, { status: 502 });
        }

        // Track the export (upsert to handle republish)
        await prisma.mediumExport.upsert({
            where: {
                projectId_nodeId_credentialId: {
                    projectId,
                    nodeId: nodeId ?? null,
                    credentialId: cred.id,
                },
            },
            update: {
                mediumPostId,
                mediumPostUrl,
                publishStatus,
                lastSyncedAt: new Date(),
            },
            create: {
                projectId,
                nodeId: nodeId ?? null,
                mediumPostId,
                mediumPostUrl,
                publishStatus,
                lastSyncedAt: new Date(),
                credentialId: cred.id,
            },
        });

        return NextResponse.json(
            { mediumPostId, mediumPostUrl },
            { status: 201 }
        );
    } catch (error) {
        logger.error("POST /api/projects/[id]/publish-to-medium error", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

/**
 * GET /api/projects/[id]/publish-to-medium
 * Returns existing Medium exports for the project.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: projectId } = await params;
        const userId = getCurrentUserId(request);

        const access = await verifyProjectAccess(projectId, userId);
        if (!access.authorized) return access.response;

        const cred = await prisma.mediumCredential.findFirst({
            where: userId ? { userId } : {},
        });
        if (!cred) {
            return NextResponse.json({ exports: [] });
        }

        const exports = await prisma.mediumExport.findMany({
            where: { projectId, credentialId: cred.id },
            orderBy: { lastSyncedAt: "desc" },
        });

        return NextResponse.json({ exports });
    } catch (error) {
        logger.error("GET /api/projects/[id]/publish-to-medium error", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
