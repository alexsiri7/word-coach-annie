import { prisma } from '@/lib/db';
import { encrypt, decrypt } from '@/lib/crypto';

const HASHNODE_GQL = 'https://gql.hashnode.com';

const ME_QUERY = `
query {
  me {
    id
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
`;

async function callHashnodeGql(token: string, query: string, variables?: Record<string, unknown>) {
    const res = await fetch(HASHNODE_GQL, {
        method: 'POST',
        headers: {
            Authorization: token,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Hashnode API error (${res.status}): ${body}`);
    }
    return res.json();
}

export class HashnodeAuthController {
    static async connect(token: string, userId: string | null) {
        const data = await callHashnodeGql(token, ME_QUERY);

        if (data.errors?.length) {
            throw new Error(`Hashnode API rejected token: ${data.errors[0].message}`);
        }

        const me = data.data?.me;
        if (!me) {
            throw new Error('Hashnode API rejected token: could not fetch user');
        }

        const username: string = me.username ?? '';
        const publicationId: string = me.publications?.edges?.[0]?.node?.id ?? '';

        if (!publicationId) {
            throw new Error('No Hashnode publication found. Create a blog at hashnode.com before connecting.');
        }

        const encryptedToken = encrypt(token);

        if (userId) {
            await prisma.hashnodeCredential.upsert({
                where: { userId },
                update: { integrationToken: encryptedToken, publicationId, username },
                create: { userId, integrationToken: encryptedToken, publicationId, username },
            });
        } else {
            await prisma.hashnodeCredential.deleteMany();
            await prisma.hashnodeCredential.create({
                data: { userId: 'local', integrationToken: encryptedToken, publicationId, username },
            });
        }

        return { username, publicationId };
    }

    static async getStatus(userId: string | null) {
        const where = userId ? { userId } : { userId: 'local' };
        const cred = await prisma.hashnodeCredential.findUnique({ where });
        if (!cred) return { connected: false };
        return { connected: true, username: cred.username, publicationId: cred.publicationId };
    }

    static async disconnect(userId: string | null) {
        const where = userId ? { userId } : { userId: 'local' };
        await prisma.hashnodeCredential.deleteMany({ where });
    }

    static async getCredential(userId: string | null) {
        const where = userId ? { userId } : { userId: 'local' };
        const cred = await prisma.hashnodeCredential.findUnique({ where });
        if (!cred) return null;
        return {
            id: cred.id,
            token: decrypt(cred.integrationToken),
            publicationId: cred.publicationId,
            username: cred.username,
        };
    }
}
