import { NextRequest, NextResponse } from 'next/server';
import { GoogleDocsExporter, ExportMode } from '@/lib/export/google-docs-exporter';
import { getCurrentUserId, verifyProjectWriteAccess } from '@/lib/api-auth';
import { logger } from '@/lib/logger';

const VALID_MODES: ExportMode[] = ['STORY_READER', 'STORY_INTERNAL'];

/**
 * POST /api/integrations/google-docs/export
 * Body: { projectId: string; exportMode: 'STORY_READER' | 'STORY_INTERNAL' }
 * Creates or updates a Google Doc for the project and returns the doc URL.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { projectId, exportMode } = body;

        if (!projectId || typeof projectId !== 'string') {
            return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
        }
        if (!exportMode || !VALID_MODES.includes(exportMode as ExportMode)) {
            return NextResponse.json(
                { error: 'exportMode must be STORY_READER or STORY_INTERNAL' },
                { status: 400 }
            );
        }

        const userId = getCurrentUserId(request);
        const access = await verifyProjectWriteAccess(projectId, userId, request.headers.get('x-user-email'));
        if (!access.authorized) return access.response;

        const result = await GoogleDocsExporter.exportToGoogleDocs(projectId, exportMode as ExportMode, userId);
        return NextResponse.json(result);
    } catch (error) {
        logger.error('POST /api/integrations/google-docs/export error', error);
        const message = error instanceof Error ? error.message : 'Export failed';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
