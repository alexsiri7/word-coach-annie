import { NextRequest, NextResponse } from 'next/server';
import { HashnodeAuthController } from '@/lib/controllers/hashnode-auth';
import { getCurrentUserId } from '@/lib/api-auth';
import { logger } from '@/lib/logger';
import { ConnectHashnodeSchema } from '@/lib/api-schemas';

/**
 * POST /api/integrations/hashnode
 * Body: { accessToken: string }
 * Verifies the token against Hashnode API, stores encrypted credential.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const parsed = ConnectHashnodeSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid request" }, { status: 400 });
        }

        const userId = getCurrentUserId(request);
        const result = await HashnodeAuthController.connect(parsed.data.accessToken.trim(), userId);

        return NextResponse.json({ connected: true, ...result });
    } catch (error) {
        logger.error('POST /api/integrations/hashnode error', error);
        const message = error instanceof Error ? error.message : 'Internal server error';
        const status = message.includes('token invalid') || message.includes('rejected token') ? 401 : 500;
        return NextResponse.json({ error: message }, { status });
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
    try {
        const userId = getCurrentUserId(request);
        await HashnodeAuthController.disconnect(userId);
        return NextResponse.json({ disconnected: true });
    } catch (error) {
        logger.error('DELETE /api/integrations/hashnode error', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
