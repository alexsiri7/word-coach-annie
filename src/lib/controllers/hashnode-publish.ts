import { prisma } from '@/lib/db';
import { HashnodeAuthController } from './hashnode-auth';
import { exportHashnode } from '@/mcp/tools/export';

const HASHNODE_GQL = 'https://gql.hashnode.com';

const CREATE_DRAFT_MUTATION = `
mutation CreateDraft($input: CreateDraftInput!) {
  createDraft(input: $input) {
    draft {
      id
      slug
    }
  }
}
`;

const PUBLISH_POST_MUTATION = `
mutation PublishPost($input: PublishPostInput!) {
  publishPost(input: $input) {
    post {
      id
      url
      slug
    }
  }
}
`;

const UPDATE_DRAFT_MUTATION = `
mutation UpdateDraft($input: UpdateDraftInput!) {
  updateDraft(input: $input) {
    draft {
      id
      title
    }
  }
}
`;

const UPDATE_POST_MUTATION = `
mutation UpdatePost($input: UpdatePostInput!) {
  updatePost(input: $input) {
    post {
      id
      url
    }
  }
}
`;

export interface PublishToHashnodeOptions {
    nodeId?: string;
    titleOverride?: string;
    publishStatus?: 'draft' | 'public' | 'unlisted';
    tags?: string[];
    canonicalUrl?: string;
}

export interface PublishResult {
    hashnodePostId: string;
    hashnodePostUrl: string;
    publishStatus: string;
    alreadyPublished?: boolean;
    updated?: boolean;
}

export interface ExistingExportInfo {
    hashnodePostId: string;
    hashnodePostUrl: string;
    publishStatus: string;
}

function toTagSlug(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function callGql(token: string, query: string, variables: Record<string, unknown>) {
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
    const data = await res.json();
    if (data.errors?.length) {
        throw new Error(`Hashnode API error: ${data.errors[0].message}`);
    }
    return data;
}

export class HashnodePublishController {
    static async getExistingExport(
        projectId: string,
        userId: string | null,
        nodeId?: string
    ): Promise<ExistingExportInfo | null> {
        const cred = await HashnodeAuthController.getCredential(userId);
        if (!cred) return null;

        const existing = await prisma.hashnodeExport.findFirst({
            where: { projectId, nodeId: nodeId ?? null, credentialId: cred.id },
        });
        if (!existing) return null;

        return {
            hashnodePostId: existing.hashnodePostId,
            hashnodePostUrl: existing.hashnodePostUrl,
            publishStatus: existing.publishStatus,
        };
    }

    static async publish(
        projectId: string,
        userId: string | null,
        options: PublishToHashnodeOptions = {}
    ): Promise<PublishResult> {
        const { nodeId, titleOverride, publishStatus = 'draft', tags = [], canonicalUrl } = options;

        const cred = await HashnodeAuthController.getCredential(userId);
        if (!cred) throw new Error('Hashnode account not connected');
        if (!cred.publicationId) throw new Error('No Hashnode publication found. Please reconnect your Hashnode account.');

        // Determine title
        let title: string;
        if (titleOverride) {
            title = titleOverride;
        } else if (nodeId) {
            const node = await prisma.structureNode.findUnique({
                where: { id: nodeId },
                select: { title: true },
            });
            if (!node) throw new Error(`Node not found: ${nodeId}`);
            title = node.title;
        } else {
            const project = await prisma.project.findUnique({
                where: { id: projectId },
                select: { title: true },
            });
            if (!project) throw new Error(`Project not found: ${projectId}`);
            title = project.title;
        }

        // Check for existing export — update if found
        const existingExport = await prisma.hashnodeExport.findFirst({
            where: { projectId, nodeId: nodeId ?? null, credentialId: cred.id },
        });

        const content = await exportHashnode(projectId, nodeId);
        const hashnodeTags = tags.map((t) => ({ name: t, slug: toTagSlug(t) }));

        if (existingExport) {
            const isDraft = existingExport.publishStatus === 'draft';

            if (isDraft) {
                const input: Record<string, unknown> = {
                    id: existingExport.hashnodePostId,
                    title,
                    contentMarkdown: content,
                };
                if (hashnodeTags.length > 0) input.tags = hashnodeTags;
                if (canonicalUrl) input.originalArticleURL = canonicalUrl;

                await callGql(cred.token, UPDATE_DRAFT_MUTATION, { input });
            } else {
                const input: Record<string, unknown> = {
                    id: existingExport.hashnodePostId,
                    title,
                    contentMarkdown: content,
                    settings: { isDelisted: existingExport.publishStatus === 'unlisted' },
                };
                if (hashnodeTags.length > 0) input.tags = hashnodeTags;
                if (canonicalUrl) input.originalArticleURL = canonicalUrl;

                await callGql(cred.token, UPDATE_POST_MUTATION, { input });
            }

            await prisma.hashnodeExport.update({
                where: { id: existingExport.id },
                data: { lastSyncedAt: new Date() },
            });

            return {
                hashnodePostId: existingExport.hashnodePostId,
                hashnodePostUrl: existingExport.hashnodePostUrl,
                publishStatus: existingExport.publishStatus,
                updated: true,
            };
        }

        let hashnodePostId: string;
        let hashnodePostUrl: string;
        let resolvedStatus: string;

        if (publishStatus === 'draft') {
            const input: Record<string, unknown> = {
                title,
                publicationId: cred.publicationId,
                contentMarkdown: content,
            };
            if (hashnodeTags.length > 0) input.tags = hashnodeTags;
            if (canonicalUrl) input.originalArticleURL = canonicalUrl;

            const data = await callGql(cred.token, CREATE_DRAFT_MUTATION, { input });
            const draft = data.data.createDraft.draft;
            hashnodePostId = draft.id;
            hashnodePostUrl = `https://hashnode.com/draft/${draft.id}`;
            resolvedStatus = 'draft';
        } else {
            const input: Record<string, unknown> = {
                title,
                publicationId: cred.publicationId,
                contentMarkdown: content,
                isHiddenFromHashnodeFeed: publishStatus === 'unlisted',
            };
            if (hashnodeTags.length > 0) input.tags = hashnodeTags;
            if (canonicalUrl) input.originalArticleURL = canonicalUrl;

            const data = await callGql(cred.token, PUBLISH_POST_MUTATION, { input });
            const post = data.data.publishPost.post;
            hashnodePostId = post.id;
            hashnodePostUrl = post.url;
            resolvedStatus = publishStatus;
        }

        await prisma.hashnodeExport.create({
            data: {
                projectId,
                nodeId: nodeId ?? null,
                hashnodePostId,
                hashnodePostUrl,
                publishStatus: resolvedStatus,
                lastSyncedAt: new Date(),
                credentialId: cred.id,
            },
        });

        return { hashnodePostId, hashnodePostUrl, publishStatus: resolvedStatus };
    }
}
