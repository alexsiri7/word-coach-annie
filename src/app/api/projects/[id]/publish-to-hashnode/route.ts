import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId, verifyProjectWriteAccess } from '@/lib/api-auth';
import { HashnodePublishController } from '@/lib/controllers/hashnode-publish';
import { logger } from '@/lib/logger';

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
