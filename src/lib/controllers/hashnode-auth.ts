import { prisma } from '@/lib/db';
import { encrypt, decrypt } from '@/lib/crypto';

const HASHNODE_GQL = 'https://gql.hashnode.com';

export class HashnodeAuthController {
    static async connect(accessToken: string, userId: string | null) {
        // Verify token by calling Hashnode's me query
        const response = await fetch(HASHNODE_GQL, {
            method: 'POST',
            headers: {
                Authorization: accessToken,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query: `
                    query Me {
                        me {
                            username
                            publications(first: 1) {
                                edges {
                                    node {
                                        id
                                    }
                                }
                            }
                        }
                    }
                `,
            }),
        });

        if (!response.ok) {
            const body = await response.text();
            throw new Error(`Hashnode API error (${response.status}): ${body}`);
        }

        const data = await response.json();
        if (data.errors) {
            throw new Error(`Hashnode token invalid: ${data.errors[0]?.message ?? 'unknown error'}`);
        }

        const me = data.data?.me;
        if (!me) {
            throw new Error('Hashnode API rejected token: no user data returned');
        }

        const username: string = me.username ?? '';
        const publicationId: string = me.publications?.edges?.[0]?.node?.id ?? '';

        const encryptedToken = encrypt(accessToken);
        const resolvedUserId = userId ?? 'local';

        await prisma.hashnodeCredential.upsert({
            where: { userId: resolvedUserId },
            update: {
                accessToken: encryptedToken,
                publicationId,
                username,
            },
            create: {
                userId: resolvedUserId,
                accessToken: encryptedToken,
                publicationId,
                username,
            },
        });

        return { publicationId, username };
    }

    static async getStatus(userId: string | null) {
        const resolvedUserId = userId ?? 'local';
        const cred = await prisma.hashnodeCredential.findUnique({ where: { userId: resolvedUserId } });
        if (!cred) return { connected: false };
        return { connected: true, username: cred.username, publicationId: cred.publicationId };
    }

    static async disconnect(userId: string | null) {
        const resolvedUserId = userId ?? 'local';
        await prisma.hashnodeCredential.deleteMany({ where: { userId: resolvedUserId } });
    }

    static async getToken(userId: string | null): Promise<string | null> {
        const resolvedUserId = userId ?? 'local';
        const cred = await prisma.hashnodeCredential.findUnique({ where: { userId: resolvedUserId } });
        if (!cred) return null;
        return decrypt(cred.accessToken);
    }
}
