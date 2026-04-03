import { NextRequest, NextResponse } from 'next/server';
import { MediumPublishController } from '@/lib/controllers/medium-publish';
import { getCurrentUserId, verifyProjectWriteAccess, verifyProjectAccess } from '@/lib/api-auth';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';

/**
 * POST /api/projects/[id]/publish-to-medium
 *
 * Body (all optional except where noted):
 *   nodeId?       - Publish a single article/chapter instead of whole project
 *   title?        - Override project title (max 100 chars)
 *   publishStatus - "draft" (default) | "public" | "unlisted"
 *   tags?         - Array of strings, max 3
 *   canonicalUrl? - Canonical URL for SEO
 *
 * Returns 201 with { mediumPostId, mediumPostUrl, publishStatus } on success.
 * Returns 409 with alreadyPublished: true if already exported.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: projectId } = await params;
        const userId = getCurrentUserId(request);

        const access = await verifyProjectWriteAccess(projectId, userId);
        if (!access.authorized) return access.response;

        const body = await request.json().catch(() => ({}));
        const { nodeId, title, publishStatus, tags, canonicalUrl } = body;

        // Validate publishStatus
        const validStatuses = ['draft', 'public', 'unlisted'];
        if (publishStatus && !validStatuses.includes(publishStatus)) {
            return NextResponse.json(
                { error: `publishStatus must be one of: ${validStatuses.join(', ')}` },
                { status: 400 }
            );
        }

        // Validate tags
        if (tags !== undefined && !Array.isArray(tags)) {
            return NextResponse.json({ error: 'tags must be an array' }, { status: 400 });
        }

        // Validate title length
        if (title && typeof title === 'string' && title.length > 100) {
            return NextResponse.json(
                { error: 'Title exceeds 100 characters (Medium limit)' },
                { status: 400 }
            );
        }

        const result = await MediumPublishController.publish(
            {
                projectId,
                nodeId: typeof nodeId === 'string' ? nodeId : undefined,
                titleOverride: typeof title === 'string' ? title : undefined,
                publishStatus: publishStatus as 'draft' | 'public' | 'unlisted' | undefined,
                tags: Array.isArray(tags) ? tags : undefined,
                canonicalUrl: typeof canonicalUrl === 'string' ? canonicalUrl : undefined,
            },
            userId
        );

        if (result.alreadyPublished) {
            return NextResponse.json(
                {
                    warning: 'This content has already been published to Medium. Medium API does not support updates.',
                    ...result,
                },
                { status: 409 }
            );
        }

        return NextResponse.json(result, { status: 201 });
    } catch (error) {
        logger.error('POST /api/projects/[id]/publish-to-medium error', error);
        const message = error instanceof Error ? error.message : 'Internal server error';

        if (message === 'Medium account not connected') {
            return NextResponse.json({ error: message }, { status: 422 });
        }
        if (message.includes('Maximum 3 tags')) {
            return NextResponse.json({ error: message }, { status: 400 });
        }
        if (message.includes('Title exceeds 100')) {
            return NextResponse.json({ error: message }, { status: 400 });
        }
        if (message.includes('No content to publish')) {
            return NextResponse.json({ error: message }, { status: 422 });
        }
        if (message.includes('Medium API error')) {
            const statusMatch = message.match(/\((\d+)\)/);
            const upstreamStatus = statusMatch ? parseInt(statusMatch[1]) : 502;
            return NextResponse.json({ error: message }, { status: upstreamStatus >= 500 ? 502 : upstreamStatus });
        }

        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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
            orderBy: { lastSyncedAt: 'desc' },
        });

        return NextResponse.json({ exports });
    } catch (error) {
        logger.error('GET /api/projects/[id]/publish-to-medium error', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
