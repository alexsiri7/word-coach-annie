import { NextRequest, NextResponse } from 'next/server';
import { HashnodeAuthController, HashnodeAuthError } from '@/lib/controllers/hashnode-auth';
import { UpstreamServiceError } from '@/lib/controllers/errors';
import { getCurrentUserId, validateCsrfHeader } from '@/lib/api-auth';
import { logger } from '@/lib/logger';

/**
 * POST /api/integrations/hashnode
 * Body: { accessToken: string }
 * Verifies the token against Hashnode API, stores encrypted credential.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { accessToken } = body;

        if (!accessToken || typeof accessToken !== 'string') {
            return NextResponse.json({ error: 'accessToken is required' }, { status: 400 });
        }

        const userId = getCurrentUserId(request);
        const result = await HashnodeAuthController.connect(accessToken.trim(), userId);

        return NextResponse.json({ connected: true, ...result });
    } catch (error) {
        logger.error('POST /api/integrations/hashnode error', error);
        if (error instanceof HashnodeAuthError) {
            return NextResponse.json({ error: 'Invalid Hashnode token' }, { status: 401 });
        }
        if (error instanceof UpstreamServiceError) {
            return NextResponse.json({ error: 'Upstream service error' }, { status: 502 });
        }
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * GET /api/integrations/hashnode
 * Returns connection status and username.
 */
export async function GET(request: NextRequest) {
    try {
        const userId = getCurrentUserId(request);
        const status = await HashnodeAuthController.getStatus(userId);
        return NextResponse.json(status);
    } catch (error) {
        logger.error('GET /api/integrations/hashnode error', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * DELETE /api/integrations/hashnode
 * Removes the stored Hashnode credential.
 */
export async function DELETE(request: NextRequest) {
    const csrfError = validateCsrfHeader(request);
    if (csrfError) return csrfError;
    try {
        const userId = getCurrentUserId(request);
        await HashnodeAuthController.disconnect(userId);
        return NextResponse.json({ disconnected: true });
    } catch (error) {
        logger.error('DELETE /api/integrations/hashnode error', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
