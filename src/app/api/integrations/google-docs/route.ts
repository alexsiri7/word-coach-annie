import { NextRequest, NextResponse } from 'next/server';
import { GoogleDocsCommentSync } from '@/lib/export/google-docs-comment-sync';
import { GoogleAuthController } from '@/lib/controllers/google-auth';
import { getCurrentUserId, verifyProjectWriteAccess } from '@/lib/api-auth';
import { logger } from '@/lib/logger';

/**
 * GET /api/integrations/google-docs?projectId=...
 * Returns Google Doc export records for the project.
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const projectId = searchParams.get('projectId');

        const userId = getCurrentUserId(request);

        // If no projectId, return connection status only (used by global settings page)
        if (!projectId) {
            const status = await GoogleAuthController.getStatus(userId);
            return NextResponse.json({ connected: status.connected });
        }

        const access = await verifyProjectWriteAccess(projectId, userId, request.headers.get('x-user-email'));
        if (!access.authorized) return access.response;

        const [exports, status] = await Promise.all([
            GoogleDocsCommentSync.getExportInfo(projectId),
            GoogleAuthController.getStatus(userId),
        ]);
        return NextResponse.json({ exports, connected: status.connected });
    } catch (error) {
        logger.error('GET /api/integrations/google-docs error', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * DELETE /api/integrations/google-docs
 * Disconnects Google Docs by removing the stored credential for the current user.
 */
export async function DELETE(request: NextRequest) {
    try {
        const userId = getCurrentUserId(request);
        await GoogleAuthController.disconnect(userId);
        return NextResponse.json({ disconnected: true });
    } catch (error) {
        logger.error('DELETE /api/integrations/google-docs error', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * POST /api/integrations/google-docs/sync-comments
 * Body: { projectId: string }
 * Fetches Google Docs comments and imports them as annotations.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { projectId } = body;

        if (!projectId || typeof projectId !== 'string') {
            return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
        }

        const userId = getCurrentUserId(request);
        const access = await verifyProjectWriteAccess(projectId, userId, request.headers.get('x-user-email'));
        if (!access.authorized) return access.response;

        const result = await GoogleDocsCommentSync.syncComments(projectId, userId);
        return NextResponse.json(result);
    } catch (error) {
        logger.error('POST /api/integrations/google-docs error', error);
        const message = error instanceof Error ? error.message : 'Internal server error';
        const status = message.includes('No Google Doc export found') ? 404 : 500;
        return NextResponse.json({ error: message }, { status });
    }
}
