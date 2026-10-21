import { NextRequest, NextResponse } from 'next/server';
import { GoogleDocsExporter, ExportMode } from '@/lib/export/google-docs-exporter';
import { getCurrentUserId, verifyProjectAccess } from '@/lib/api-auth';
import { logger } from '@/lib/logger';

const VALID_MODES: ExportMode[] = ['STORY_READER', 'STORY_INTERNAL'];

/**
 * POST /api/integrations/google-docs/export
 * Body: { projectId: string; exportMode: 'STORY_READER' | 'STORY_INTERNAL' }
 * Creates or updates a Google Doc for the project and returns the doc URL.
 * Owner-only: the export mapping is shared by all collaborators, so only the owner may create or redirect it (SEC-19).
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
        const access = await verifyProjectAccess(projectId, userId);
        if (!access.authorized) return access.response;

        const result = await GoogleDocsExporter.exportToGoogleDocs(projectId, exportMode as ExportMode, userId);
        return NextResponse.json(result);
    } catch (error) {
        logger.error('POST /api/integrations/google-docs/export error', error);
        return NextResponse.json({ error: 'Export failed' }, { status: 500 });
    }
}
