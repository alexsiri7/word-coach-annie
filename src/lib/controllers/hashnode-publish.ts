import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { exportHashnode } from '@/mcp/tools/export';

const HASHNODE_GQL = 'https://gql.hashnode.com';

export interface PublishToHashnodeOptions {
    nodeId?: string;
    titleOverride?: string;
    publishStatus?: 'draft' | 'unlisted' | 'public';
    tags?: string[];
    canonicalUrl?: string;
}

export interface HashnodePublishResult {
    hashnodePostId: string;
    hashnodePostUrl: string;
    publishStatus: string;
    alreadyPublished?: boolean;
    updated?: boolean;
}

export class HashnodePublishController {
    static async publish(
        projectId: string,
        userId: string | null,
        options: PublishToHashnodeOptions = {}
    ): Promise<HashnodePublishResult> {
        const { nodeId, titleOverride, publishStatus = 'draft', tags = [], canonicalUrl } = options;

        // Get credential
        const resolvedUserId = userId ?? 'local';
        const cred = await prisma.hashnodeCredential.findUnique({ where: { userId: resolvedUserId } });
        if (!cred) {
            throw new Error('Hashnode account not connected');
        }

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

        // Generate content
        const contentMarkdown = await exportHashnode(projectId, nodeId);

        const accessToken = decrypt(cred.accessToken);

        // Build tag input for Hashnode
        const tagInput = tags.map((name) => ({ name, slug: name.toLowerCase().replace(/\s+/g, '-') }));

        // If export record exists, update the existing post/draft instead of creating a new one
        if (existingExport) {
            const isDraft = existingExport.publishStatus === 'draft';

            if (isDraft) {
                const input: Record<string, unknown> = {
                    draftId: existingExport.hashnodePostId,
                    title,
                    contentMarkdown,
                    tags: tagInput,
                };
                if (canonicalUrl) input.originalArticleURL = canonicalUrl;

                const response = await fetch(HASHNODE_GQL, {
                    method: 'POST',
                    headers: {
                        Authorization: accessToken,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        query: `
                            mutation UpdateDraft($input: UpdateDraftInput!) {
                                updateDraft(input: $input) {
                                    draft {
                                        id
                                        title
                                    }
                                }
                            }
                        `,
                        variables: { input },
                    }),
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Hashnode API error (${response.status}): ${errorText}`);
                }

                const result = await response.json();
                if (result.errors) {
                    throw new Error(`Hashnode API error: ${result.errors[0]?.message ?? 'unknown'}`);
                }
            } else {
                const input: Record<string, unknown> = {
                    postId: existingExport.hashnodePostId,
                    title,
                    contentMarkdown,
                    tags: tagInput,
                    settings: { isDelisted: existingExport.publishStatus === 'unlisted' },
                };
                if (canonicalUrl) input.originalArticleURL = canonicalUrl;

                const response = await fetch(HASHNODE_GQL, {
                    method: 'POST',
                    headers: {
                        Authorization: accessToken,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        query: `
                            mutation UpdatePost($input: UpdatePostInput!) {
                                updatePost(input: $input) {
                                    post {
                                        id
                                        url
                                    }
                                }
                            }
                        `,
                        variables: { input },
                    }),
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Hashnode API error (${response.status}): ${errorText}`);
                }

                const result = await response.json();
                if (result.errors) {
                    throw new Error(`Hashnode API error: ${result.errors[0]?.message ?? 'unknown'}`);
                }
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

        let postId: string;
        let postUrl: string;
        let resultStatus: string;

        if (publishStatus === 'draft') {
            // Use createDraft mutation
            const input: Record<string, unknown> = {
                title,
                publicationId: cred.publicationId,
                contentMarkdown,
                tags: tagInput,
            };
            if (canonicalUrl) input.originalArticleURL = canonicalUrl;

            const response = await fetch(HASHNODE_GQL, {
                method: 'POST',
                headers: {
                    Authorization: accessToken,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: `
                        mutation CreateDraft($input: CreateDraftInput!) {
                            createDraft(input: $input) {
                                draft {
                                    id
                                    title
                                }
                            }
                        }
                    `,
                    variables: { input },
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Hashnode API error (${response.status}): ${errorText}`);
            }

            const result = await response.json();
            if (result.errors) {
                throw new Error(`Hashnode API error: ${result.errors[0]?.message ?? 'unknown'}`);
            }

            const draft = result.data?.createDraft?.draft;
            if (!draft) throw new Error('Hashnode createDraft returned no draft');

            postId = draft.id;
            postUrl = `https://hashnode.com/draft/${draft.id}`;
            resultStatus = 'draft';
        } else {
            // Use publishPost mutation
            const isUnlisted = publishStatus === 'unlisted';
            const input: Record<string, unknown> = {
                title,
                publicationId: cred.publicationId,
                contentMarkdown,
                tags: tagInput,
                settings: { isDelisted: isUnlisted },
            };
            if (canonicalUrl) input.originalArticleURL = canonicalUrl;

            const response = await fetch(HASHNODE_GQL, {
                method: 'POST',
                headers: {
                    Authorization: accessToken,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: `
                        mutation PublishPost($input: PublishPostInput!) {
                            publishPost(input: $input) {
                                post {
                                    id
                                    url
                                }
                            }
                        }
                    `,
                    variables: { input },
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Hashnode API error (${response.status}): ${errorText}`);
            }

            const result = await response.json();
            if (result.errors) {
                throw new Error(`Hashnode API error: ${result.errors[0]?.message ?? 'unknown'}`);
            }

            const post = result.data?.publishPost?.post;
            if (!post) throw new Error('Hashnode publishPost returned no post');

            postId = post.id;
            postUrl = post.url;
            resultStatus = publishStatus;
        }

        // Store export record
        await prisma.hashnodeExport.create({
            data: {
                projectId,
                nodeId: nodeId ?? null,
                hashnodePostId: postId,
                hashnodePostUrl: postUrl,
                publishStatus: resultStatus,
                lastSyncedAt: new Date(),
                credentialId: cred.id,
            },
        });

        return {
            hashnodePostId: postId,
            hashnodePostUrl: postUrl,
            publishStatus: resultStatus,
        };
    }
}
