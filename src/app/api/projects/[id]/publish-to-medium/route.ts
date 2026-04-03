import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId, verifyProjectWriteAccess } from '@/lib/api-auth';
import { MediumPublishController } from '@/lib/controllers/medium-publish';
import { logger } from '@/lib/logger';

/**
 * POST /api/projects/[id]/publish-to-medium
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

        // Validate publishStatus if provided
        if (publishStatus && !['draft', 'public', 'unlisted'].includes(publishStatus)) {
            return NextResponse.json(
                { error: 'publishStatus must be draft, public, or unlisted' },
                { status: 400 }
            );
        }

        // Validate tags
        if (tags !== undefined && !Array.isArray(tags)) {
            return NextResponse.json({ error: 'tags must be an array' }, { status: 400 });
        }

        const result = await MediumPublishController.publish(id, userId, {
            nodeId,
            titleOverride,
            publishStatus,
            tags,
            canonicalUrl,
        });

        if (result.alreadyPublished) {
            return NextResponse.json(
                {
                    warning: 'This content has already been published to Medium. Medium does not support post updates via API.',
                    mediumPostUrl: result.mediumPostUrl,
                    mediumPostId: result.mediumPostId,
                    publishStatus: result.publishStatus,
                },
                { status: 200 }
            );
        }

        return NextResponse.json(
            {
                mediumPostUrl: result.mediumPostUrl,
                mediumPostId: result.mediumPostId,
                publishStatus: result.publishStatus,
            },
            { status: 201 }
        );
    } catch (error) {
        logger.error('POST /api/projects/[id]/publish-to-medium error', error);
        const message = error instanceof Error ? error.message : 'Internal server error';

        if (message === 'Medium account not connected') {
            return NextResponse.json({ error: message }, { status: 400 });
        }
        if (message.startsWith('Title exceeds') || message.startsWith('Medium allows')) {
            return NextResponse.json({ error: message }, { status: 422 });
        }
        if (message.startsWith('Medium API error')) {
            return NextResponse.json({ error: message }, { status: 502 });
        }

        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
