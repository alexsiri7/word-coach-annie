import { prisma } from '@/lib/db';
import { HashnodeNotConnectedError, postHashnodeGql, readHashnodeToken } from '@/lib/controllers/hashnode-auth';
import { UpstreamServiceError } from '@/lib/controllers/errors';
import { exportHashnode } from '@/mcp/tools/export';

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

/** Run a Hashnode mutation, treating GraphQL errors as upstream failures. */
async function publishGql<T>(accessToken: string, query: string, input: Record<string, unknown>): Promise<{ data?: T }> {
    const result = await postHashnodeGql<T>(accessToken, query, { input });
    if (result.errors) {
        throw new UpstreamServiceError(`Hashnode API error: ${result.errors[0]?.message ?? 'unknown'}`);
    }
    return result;
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
        const accessToken = cred ? await readHashnodeToken(cred) : null;
        if (!cred || accessToken === null) {
            throw new HashnodeNotConnectedError();
        }

        // Determine title
        let title: string;
        if (titleOverride) {
            title = titleOverride;
        } else if (nodeId) {
            const node = await prisma.structureNode.findFirst({
                where: { id: nodeId, projectId },
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

                await publishGql(accessToken, `
                        mutation UpdateDraft($input: UpdateDraftInput!) {
                            updateDraft(input: $input) {
                                draft {
                                    id
                                    title
                                }
                            }
                        }
                    `, input);
            } else {
                const input: Record<string, unknown> = {
                    postId: existingExport.hashnodePostId,
                    title,
                    contentMarkdown,
                    tags: tagInput,
                    settings: { isDelisted: existingExport.publishStatus === 'unlisted' },
                };
                if (canonicalUrl) input.originalArticleURL = canonicalUrl;

                await publishGql(accessToken, `
                        mutation UpdatePost($input: UpdatePostInput!) {
                            updatePost(input: $input) {
                                post {
                                    id
                                    url
                                }
                            }
                        }
                    `, input);
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

            const result = await publishGql<{ createDraft?: { draft?: { id: string } } }>(accessToken, `
                    mutation CreateDraft($input: CreateDraftInput!) {
                        createDraft(input: $input) {
                            draft {
                                id
                                title
                            }
                        }
                    }
                `, input);

            const draft = result.data?.createDraft?.draft;
            if (!draft) throw new UpstreamServiceError('Hashnode createDraft returned no draft');

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

            const result = await publishGql<{ publishPost?: { post?: { id: string; url: string } } }>(accessToken, `
                    mutation PublishPost($input: PublishPostInput!) {
                        publishPost(input: $input) {
                            post {
                                id
                                url
                            }
                        }
                    }
                `, input);

            const post = result.data?.publishPost?.post;
            if (!post) throw new UpstreamServiceError('Hashnode publishPost returned no post');

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
