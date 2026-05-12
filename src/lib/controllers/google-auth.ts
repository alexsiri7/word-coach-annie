import { google } from 'googleapis';
import { prisma } from '@/lib/db';
import { encrypt, decrypt } from '@/lib/crypto';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

// Derive OAuth2Client from googleapis to avoid type conflicts introduced by @google/adk v1.x,
// which bundles @google/genai's own google-auth-library (separate private property declarations
// cause structural incompatibility with the top-level import).
type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

const DEFAULT_USER_ID = 'local';

export class GoogleAuthController {
    private static getClient(redirectUri?: string): OAuth2Client {
        return new google.auth.OAuth2(
            env.GOOGLE_CLIENT_ID,
            env.GOOGLE_CLIENT_SECRET,
            redirectUri ?? env.GOOGLE_REDIRECT_URI
        );
    }

    static getAuthUrl(redirectUri?: string) {
        const client = this.getClient(redirectUri ?? env.GOOGLE_REDIRECT_URI);
        return client.generateAuthUrl({
            access_type: 'offline', // Critical for refresh token
            scope: [
                'https://www.googleapis.com/auth/documents',
                'https://www.googleapis.com/auth/drive.file'
            ],
            prompt: 'consent' // Force refresh token on first login
        });
    }

    static async handleCallback(code: string, redirectUri?: string, userId?: string | null) {
        const client = this.getClient(redirectUri ?? env.GOOGLE_REDIRECT_URI);
        const { tokens } = await client.getToken(code);
        const resolvedUserId = userId ?? DEFAULT_USER_ID;

        // Replace existing credentials for this user only
        await prisma.googleCredential.deleteMany({ where: { userId: resolvedUserId } });

        await prisma.googleCredential.create({
            data: {
                userId: resolvedUserId,
                accessToken: encrypt(tokens.access_token!),
                refreshToken: encrypt(tokens.refresh_token!), // This might be undefined if not first time/consent
                expiresAt: new Date(tokens.expiry_date!),
                scope: tokens.scope || '',
            }
        });

        return tokens;
    }

    static async getValidClient(userId?: string | null): Promise<OAuth2Client | null> {
        const resolvedUserId = userId ?? DEFAULT_USER_ID;
        const cred = await prisma.googleCredential.findUnique({ where: { userId: resolvedUserId } });
        if (!cred) return null;

        const client = this.getClient(undefined);
        client.setCredentials({
            access_token: decrypt(cred.accessToken),
            refresh_token: decrypt(cred.refreshToken),
            expiry_date: cred.expiresAt.getTime()
        });

        // Setup token refresh handler
        client.on('tokens', async (tokens) => {
            if (tokens.access_token) {
                try {
                    // Update existing credential with encrypted tokens
                    await prisma.googleCredential.update({
                        where: { id: cred.id },
                        data: {
                            accessToken: encrypt(tokens.access_token),
                            expiresAt: new Date(tokens.expiry_date!),
                            // Only update refresh token if a new one is provided
                            ...(tokens.refresh_token ? { refreshToken: encrypt(tokens.refresh_token) } : {})
                        }
                    });
                } catch (err) {
                    logger.error("Failed to persist refreshed Google tokens", err);
                }
            }
        });

        return client;
    }

    static async getStatus(userId?: string | null) {
        const resolvedUserId = userId ?? DEFAULT_USER_ID;
        const cred = await prisma.googleCredential.findUnique({ where: { userId: resolvedUserId } });
        if (!cred) return { connected: false };

        // Check if token is expired, though client handles refresh
        const isExpired = cred.expiresAt.getTime() < Date.now();
        return {
            connected: true,
            expiresAt: cred.expiresAt,
            isExpired
        };
    }

    static async disconnect(userId?: string | null) {
        const resolvedUserId = userId ?? DEFAULT_USER_ID;
        await prisma.googleCredential.deleteMany({ where: { userId: resolvedUserId } });
    }
}
