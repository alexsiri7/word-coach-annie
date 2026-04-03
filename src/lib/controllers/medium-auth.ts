import { prisma } from '@/lib/db';
import { encrypt, decrypt } from '@/lib/crypto';

const MEDIUM_API_BASE = 'https://api.medium.com/v1';

export class MediumAuthController {
    static async connect(integrationToken: string, userId: string | null) {
        // Verify token by calling Medium's /me endpoint
        const response = await fetch(`${MEDIUM_API_BASE}/me`, {
            headers: {
                Authorization: `Bearer ${integrationToken}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            const body = await response.text();
            throw new Error(`Medium API rejected token (${response.status}): ${body}`);
        }

        const data = await response.json();
        const { id: authorId, username } = data.data;

        const encryptedToken = encrypt(integrationToken);

        if (userId) {
            // Upsert by userId
            await prisma.mediumCredential.upsert({
                where: { userId },
                update: {
                    integrationToken: encryptedToken,
                    authorId,
                    username,
                },
                create: {
                    userId,
                    integrationToken: encryptedToken,
                    authorId,
                    username,
                },
            });
        } else {
            // Single-user / API_TOKEN mode: replace any existing credential
            await prisma.mediumCredential.deleteMany();
            await prisma.mediumCredential.create({
                data: {
                    userId: 'local',
                    integrationToken: encryptedToken,
                    authorId,
                    username,
                },
            });
        }

        return { authorId, username };
    }

    static async getStatus(userId: string | null) {
        const where = userId ? { userId } : { userId: 'local' };
        const cred = await prisma.mediumCredential.findUnique({ where });
        if (!cred) return { connected: false };
        return { connected: true, username: cred.username, authorId: cred.authorId };
    }

    static async disconnect(userId: string | null) {
        if (userId) {
            await prisma.mediumCredential.deleteMany({ where: { userId } });
        } else {
            await prisma.mediumCredential.deleteMany({ where: { userId: 'local' } });
        }
    }

    static async getToken(userId: string | null): Promise<string | null> {
        const where = userId ? { userId } : { userId: 'local' };
        const cred = await prisma.mediumCredential.findUnique({ where });
        if (!cred) return null;
        return decrypt(cred.integrationToken);
    }
}
