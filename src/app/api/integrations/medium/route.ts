import { NextRequest, NextResponse } from 'next/server';
import { MediumAuthController } from '@/lib/controllers/medium-auth';
import { getCurrentUserId } from '@/lib/api-auth';
import { logger } from '@/lib/logger';

/**
 * POST /api/integrations/medium/connect
 * Body: { integrationToken: string }
 * Verifies the token against Medium API, stores encrypted credential.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { integrationToken } = body;

        if (!integrationToken || typeof integrationToken !== 'string') {
            return NextResponse.json({ error: 'integrationToken is required' }, { status: 400 });
        }

        const userId = getCurrentUserId(request);
        const result = await MediumAuthController.connect(integrationToken.trim(), userId);

        return NextResponse.json({ connected: true, ...result });
    } catch (error) {
        logger.error('POST /api/integrations/medium error', error);
        const message = error instanceof Error ? error.message : 'Internal server error';
        const status = message.includes('Medium API rejected token') ? 401 : 500;
        return NextResponse.json({ error: message }, { status });
    }
}

/**
 * GET /api/integrations/medium/status
 * Returns connection status and username.
 */
export async function GET(request: NextRequest) {
    try {
        const userId = getCurrentUserId(request);
        const status = await MediumAuthController.getStatus(userId);
        return NextResponse.json(status);
    } catch (error) {
        logger.error('GET /api/integrations/medium error', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * DELETE /api/integrations/medium
 * Removes the stored Medium credential.
 */
export async function DELETE(request: NextRequest) {
    try {
        const userId = getCurrentUserId(request);
        await MediumAuthController.disconnect(userId);
        return NextResponse.json({ disconnected: true });
    } catch (error) {
        logger.error('DELETE /api/integrations/medium error', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
