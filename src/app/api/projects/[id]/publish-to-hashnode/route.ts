import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId, verifyProjectWriteAccess } from '@/lib/api-auth';
import { HashnodePublishController } from '@/lib/controllers/hashnode-publish';
import { logger } from '@/lib/logger';

/**
 * POST /api/projects/[id]/publish-to-hashnode
 * Body: {
 *   nodeId?: string,
 *   titleOverride?: string,
 *   publishStatus?: 'draft' | 'unlisted' | 'public',
 *   tags?: string[],
 *   canonicalUrl?: string
 * }
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const userId = getCurrentUserId(request);
        const access = await verifyProjectWriteAccess(id, userId, request.headers.get('x-user-email'));
        if (!access.authorized) return access.response;

        const body = await request.json();
        const { nodeId, titleOverride, publishStatus, tags, canonicalUrl } = body;

        if (publishStatus && !['draft', 'unlisted', 'public'].includes(publishStatus)) {
            return NextResponse.json(
                { error: 'publishStatus must be draft, unlisted, or public' },
                { status: 400 }
            );
        }

        if (tags !== undefined && !Array.isArray(tags)) {
            return NextResponse.json({ error: 'tags must be an array' }, { status: 400 });
        }

        const result = await HashnodePublishController.publish(id, userId, {
            nodeId,
            titleOverride,
            publishStatus,
            tags,
            canonicalUrl,
        });

        if (result.alreadyPublished) {
            return NextResponse.json(
                {
                    warning: 'This content has already been published to Hashnode.',
                    hashnodePostUrl: result.hashnodePostUrl,
                    hashnodePostId: result.hashnodePostId,
                    publishStatus: result.publishStatus,
                },
                { status: 200 }
            );
        }

        return NextResponse.json(
            {
                hashnodePostUrl: result.hashnodePostUrl,
                hashnodePostId: result.hashnodePostId,
                publishStatus: result.publishStatus,
            },
            { status: 201 }
        );
    } catch (error) {
        logger.error('POST /api/projects/[id]/publish-to-hashnode error', error);
        const message = error instanceof Error ? error.message : 'Internal server error';

        if (message === 'Hashnode account not connected') {
            return NextResponse.json({ error: message }, { status: 400 });
        }
        if (message.startsWith('Hashnode API error')) {
            return NextResponse.json({ error: message }, { status: 502 });
        }

        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * GET /api/projects/[id]/publish-to-hashnode
 * Returns existing Hashnode exports for this project.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const userId = getCurrentUserId(request);
        const access = await verifyProjectWriteAccess(id, userId, request.headers.get('x-user-email'));
        if (!access.authorized) return access.response;

        const { prisma } = await import('@/lib/db');
        const exports = await prisma.hashnodeExport.findMany({
            where: { projectId: id },
            select: {
                hashnodePostId: true,
                hashnodePostUrl: true,
                publishStatus: true,
                nodeId: true,
                lastSyncedAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json({ exports });
    } catch (error) {
        logger.error('GET /api/projects/[id]/publish-to-hashnode error', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
