import { prisma } from '@/lib/db';
import { encrypt, isUndecryptable, readEncrypted } from '@/lib/crypto';
import { UpstreamServiceError } from '@/lib/controllers/errors';

const HASHNODE_GQL = 'https://gql.hashnode.com';

/** Hashnode rejected the access token. */
export class HashnodeAuthError extends Error {}

/** The user has no stored Hashnode token that the current keys can decrypt. */
export class HashnodeNotConnectedError extends Error {
    constructor() {
        super('Hashnode account not connected');
    }
}

export interface HashnodeGqlResponse<T> {
    data?: T;
    errors?: { message?: string }[];
}

/**
 * POST a GraphQL query to Hashnode. Throws UpstreamServiceError on a non-2xx
 * response; GraphQL `errors` are returned for the caller to classify.
 */
export async function postHashnodeGql<T>(
    accessToken: string,
    query: string,
    variables?: Record<string, unknown>
): Promise<HashnodeGqlResponse<T>> {
    const response = await fetch(HASHNODE_GQL, {
        method: 'POST',
        headers: {
            Authorization: accessToken,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
        const body = await response.text();
        throw new UpstreamServiceError(`Hashnode API error (${response.status}): ${body}`);
    }

    return response.json();
}

/**
 * Decrypt a stored Hashnode token, rewriting it under the current key when it
 * was read with a previous one. Null when no configured key decrypts it.
 */
export function readHashnodeToken(cred: { id: string; accessToken: string }): Promise<string | null> {
    return readEncrypted(cred.accessToken, {
        field: 'HashnodeCredential.accessToken',
        // Compare-and-swap: a reconnect that already replaced the token wins.
        rewrite: (reencrypted) => prisma.hashnodeCredential.updateMany({
            where: { id: cred.id, accessToken: cred.accessToken },
            data: { accessToken: reencrypted },
        }),
    });
}

export class HashnodeAuthController {
    static async connect(accessToken: string, userId: string | null) {
        // Verify token by calling Hashnode's me query
        const data = await postHashnodeGql<{
            me?: { username?: string; publications?: { edges?: { node?: { id?: string } }[] } };
        }>(accessToken, `
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
        `);
        if (data.errors) {
            throw new HashnodeAuthError(`Hashnode token invalid: ${data.errors[0]?.message ?? 'unknown error'}`);
        }

        const me = data.data?.me;
        if (!me) {
            throw new HashnodeAuthError('Hashnode API rejected token: no user data returned');
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
        if (isUndecryptable(cred.accessToken, 'HashnodeCredential.accessToken')) return { connected: false };
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
        return readHashnodeToken(cred);
    }
}
