import { NextRequest, NextResponse } from 'next/server';
import { GoogleDocsCommentSync } from '@/lib/export/google-docs-comment-sync';
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
        if (!projectId) {
            return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
        }

        const userId = getCurrentUserId(request);
        const access = await verifyProjectWriteAccess(projectId, userId, request.headers.get('x-user-email'));
        if (!access.authorized) return access.response;

        const exports = await GoogleDocsCommentSync.getExportInfo(projectId);
        return NextResponse.json({ exports });
    } catch (error) {
        logger.error('GET /api/integrations/google-docs error', error);
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

        const result = await GoogleDocsCommentSync.syncComments(projectId);
        return NextResponse.json(result);
    } catch (error) {
        logger.error('POST /api/integrations/google-docs error', error);
        const message = error instanceof Error ? error.message : 'Internal server error';
        const status = message.includes('No Google Doc export found') ? 404 : 500;
        return NextResponse.json({ error: message }, { status });
    }
}
