import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId, verifyProjectWriteAccess, verifyProjectReadAccess } from '@/lib/api-auth';
import { HashnodePublishController } from '@/lib/controllers/hashnode-publish';
import { logger } from '@/lib/logger';

/**
 * GET /api/projects/[id]/publish-to-hashnode?nodeId=...
 * Returns existing Hashnode export info if present, or null.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const userId = getCurrentUserId(request);
        const access = await verifyProjectReadAccess(id, userId, request.headers.get('x-user-email'));
        if (!access.authorized) return access.response;

        const nodeId = request.nextUrl.searchParams.get('nodeId') ?? undefined;
        const existing = await HashnodePublishController.getExistingExport(id, userId, nodeId);
        return NextResponse.json({ existing });
    } catch (error) {
        logger.error('GET /api/projects/[id]/publish-to-hashnode error', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * POST /api/projects/[id]/publish-to-hashnode
 * Body: {
 *   nodeId?: string,
 *   titleOverride?: string,
 *   publishStatus?: 'draft' | 'public' | 'unlisted',
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

        if (publishStatus && !['draft', 'public', 'unlisted'].includes(publishStatus)) {
            return NextResponse.json(
                { error: 'publishStatus must be draft, public, or unlisted' },
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

        return NextResponse.json(
            {
                hashnodePostUrl: result.hashnodePostUrl,
                hashnodePostId: result.hashnodePostId,
                publishStatus: result.publishStatus,
                updated: result.updated ?? false,
            },
            { status: result.updated ? 200 : 201 }
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
