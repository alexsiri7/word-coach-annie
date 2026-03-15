import { google } from 'googleapis';
import { prisma } from '@/lib/db';
import { OAuth2Client } from 'google-auth-library';
import { encrypt, decrypt } from '@/lib/crypto';

export class GoogleAuthController {
    private static getClient(): OAuth2Client {
        return new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );
    }

    static getAuthUrl() {
        const client = this.getClient();
        return client.generateAuthUrl({
            access_type: 'offline', // Critical for refresh token
            scope: [
                'https://www.googleapis.com/auth/documents',
                'https://www.googleapis.com/auth/drive.file'
            ],
            prompt: 'consent' // Force refresh token on first login
        });
    }

    static async handleCallback(code: string) {
        const client = this.getClient();
        const { tokens } = await client.getToken(code);

        // In local single-user mode, we replace any existing credentials
        await prisma.googleCredential.deleteMany();

        await prisma.googleCredential.create({
            data: {
                accessToken: encrypt(tokens.access_token!),
                refreshToken: encrypt(tokens.refresh_token!), // This might be undefined if not first time/consent
                expiresAt: new Date(tokens.expiry_date!),
                scope: tokens.scope || '',
            }
        });

        return tokens;
    }

    static async getValidClient(): Promise<OAuth2Client | null> {
        const cred = await prisma.googleCredential.findFirst();
        if (!cred) return null;

        const client = this.getClient();
        client.setCredentials({
            access_token: decrypt(cred.accessToken),
            refresh_token: decrypt(cred.refreshToken),
            expiry_date: cred.expiresAt.getTime()
        });

        // Setup token refresh handler
        client.on('tokens', async (tokens) => {
            if (tokens.access_token) {
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
            }
        });

        return client;
    }

    static async getStatus() {
        const cred = await prisma.googleCredential.findFirst();
        if (!cred) return { connected: false };

        // Check if token is expired, though client handles refresh
        const isExpired = cred.expiresAt.getTime() < Date.now();
        return {
            connected: true,
            expiresAt: cred.expiresAt,
            isExpired
        };
    }

    static async disconnect() {
        // Optionally revoke token here
        await prisma.googleCredential.deleteMany();
    }
}
